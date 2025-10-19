// === Deno WebRTC Signaling Server (with CORS) ===
// Simple broadcast signaling via WebSocket

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const listeners = new Map<string, WebSocket>(); // id -> ws
let broadcaster: WebSocket | null = null;

console.log("🎧 Deno FM Signaling running on :8080");

serve((req) => {
  // ✅ Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // ✅ Normal WebSocket upgrade
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role") || "listener";

  // Only upgrade for WebSocket
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("This endpoint only supports WebSocket", {
      status: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    if (role === "broadcaster") {
      broadcaster = socket;
      console.log("📡 Broadcaster connected");
    } else {
      const id = crypto.randomUUID();
      listeners.set(id, socket);
      console.log("👂 Listener joined:", id);
    }
  };

  socket.onmessage = (e) => {
    const data = JSON.parse(e.data);

    if (role === "broadcaster") {
      // send offer to all listeners
      for (const ws of listeners.values()) {
        try {
          ws.send(JSON.stringify({ type: "offer", sdp: data.sdp }));
        } catch (_) {}
      }
    } else if (role === "listener") {
      // send answer back to broadcaster
      try {
        broadcaster?.send(JSON.stringify({ type: "answer", sdp: data.sdp }));
      } catch (_) {}
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
      console.log("👋 Listener left");
    }
  };

  return response;
}, { port: 8080 });
