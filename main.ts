// === Deno Binary Audio Broadcast Server (Stable) ===
// Run: deno run --allow-net main.ts
// URL: https://vfy-call.deno.dev

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let broadcaster: WebSocket | null = null;
const listeners = new Set<WebSocket>();

console.log("🎧 Binary Audio Server running...");

// Handle requests
serve(async (req) => {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");

  // Preflight (CORS)
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }

  // WebSocket upgrade
  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    console.log(`🔌 WS connected: ${role}`);

    socket.binaryType = "arraybuffer";

    socket.onopen = () => {
      if (role === "broadcaster") {
        broadcaster = socket;
        console.log("📡 Broadcaster connected");
      } else {
        listeners.add(socket);
        console.log(`👂 Listener joined (${listeners.size})`);
      }
    };

    socket.onmessage = (event) => {
      // Relay binary data directly from broadcaster → all listeners
      if (role === "broadcaster") {
        if (event.data instanceof ArrayBuffer) {
          for (const client of listeners) {
            try {
              client.send(event.data);
            } catch (err) {
              console.error("Send error:", err);
            }
          }
        } else if (typeof event.data === "string") {
          // ignore textual data for now
        }
      }
    };

    socket.onclose = () => {
      console.log("❌ WS closed:", role);
      if (role === "broadcaster") broadcaster = null;
      else listeners.delete(socket);
    };

    socket.onerror = (err) => console.error("⚠️ Socket error:", err);

    return response;
  }

  // Default HTTP response
  return new Response("🎧 Deno FM server active", {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
});
