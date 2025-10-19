// === Deno FM Streaming Server ===
// Real-time audio chunk relay (with CORS)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const listeners = new Set<WebSocket>();
let broadcaster: WebSocket | null = null;

console.log("🎧 Deno FM running on :8080");

serve((req) => {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role") || "listener";

  // --- CORS header ---
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    if (role === "broadcaster") {
      broadcaster = socket;
      console.log("📡 Broadcaster connected");
    } else {
      listeners.add(socket);
      console.log("👂 Listener joined, total:", listeners.size);
    }
  };

  socket.onmessage = (e) => {
    if (role === "broadcaster") {
      for (const ws of listeners) {
        if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
      }
    }
  };

  socket.onclose = () => {
    if (role === "broadcaster") broadcaster = null;
    else listeners.delete(socket);
  };

  return new Response(null, {
    status: 101,
    headers: { "Access-Control-Allow-Origin": "*" },
    webSocket: socket,
  });
}, { port: 8080 });
