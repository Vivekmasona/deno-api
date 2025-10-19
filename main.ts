// === Deno Binary Audio Broadcast Server (CORS fixed) ===
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let broadcaster: WebSocket | null = null;
const listeners = new Set<WebSocket>();

console.log("🎧 Binary FM Server running...");

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }

  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    if (role === "broadcaster") {
      broadcaster = socket;
      console.log("📡 Broadcaster connected");
    } else {
      listeners.add(socket);
      console.log("👂 Listener joined (" + listeners.size + ")");
    }
  };

  socket.onmessage = (e) => {
    // Broadcast binary data directly
    if (role === "broadcaster" && e.data instanceof Uint8Array || e.data instanceof ArrayBuffer) {
      for (const l of listeners) {
        try { l.send(e.data); } catch {}
      }
    }
  };

  socket.onclose = () => {
    if (role === "broadcaster") broadcaster = null;
    else listeners.delete(socket);
  };

  return new Response("ok", {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    },
  });
});
