// main.ts
// Deno WebSocket relay for binary audio streaming
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Role = "broadcaster" | "listener";

const listeners = new Map<string, WebSocket>();
let broadcaster: WebSocket | null = null;

console.log("🎧 Deno streaming relay starting on :8080");

serve((req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }),
    });
  }

  // Must be websocket upgrade
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("This endpoint only supports WebSocket", {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const url = new URL(req.url);
  const role = (url.searchParams.get("role") || "listener") as Role;
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    if (role === "broadcaster") {
      broadcaster = socket;
      console.log("📡 Broadcaster connected");
      // notify listeners (optional)
    } else {
      const id = crypto.randomUUID();
      listeners.set(id, socket);
      console.log("👂 Listener joined:", id);
    }
  };

  socket.onmessage = (e) => {
    try {
      // If message is string -> control JSON, else binary -> forward
      if (typeof e.data === "string") {
        const msg = JSON.parse(e.data || "{}");
        // Forward JSON signals if needed (not used much here)
        if (msg.type === "info" && role === "broadcaster") {
          // forward info to listeners if needed
          for (const ws of listeners.values()) {
            try { ws.send(JSON.stringify(msg)); } catch (_) {}
          }
        }
      } else {
        // Binary frame: forward to listeners
        // e.data may be Uint8Array or ArrayBuffer
        const data = e.data;
        if (role === "broadcaster") {
          for (const [id, ws] of listeners.entries()) {
            try {
              // Forward raw binary frame
              ws.send(data);
            } catch (err) {
              console.log("Forward error -> remove listener", id);
              listeners.delete(id);
            }
          }
        } else if (role === "listener") {
          // (optional) listeners usually don't send binary
          // Could forward feedback to broadcaster if needed
        }
      }
    } catch (err) {
      console.error("onmessage error:", err);
    }
  };

  socket.onclose = () => {
    if (role === "broadcaster") {
      broadcaster = null;
      console.log("❌ Broadcaster disconnected");
    } else {
      for (const [id, ws] of listeners.entries()) {
        if (ws === socket) listeners.delete(id);
      }
      console.log("👋 Listener disconnected");
    }
  };

  socket.onerror = (ev) => console.error("WS error:", ev);

  return response;
}, { port: 8080 });
