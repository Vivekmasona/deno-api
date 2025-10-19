// === FM Radio Signaling Server ===
// Works with any frontend (CORS safe)
// Deno Deploy: https://dash.deno.com/
// Node (Bun/Render): works same

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  role: "broadcaster" | "listener";
  ws: WebSocket;
}

const clients = new Map<string, Client>();
let broadcaster: Client | null = null;

console.log("🎧 FM Radio Signaling Server Started");

serve((req) => {
  // Handle CORS for any HTTP request
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // If not WebSocket upgrade, return info message
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("🎙️ FM Radio API is running fine", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Upgrade to WebSocket
  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();

  socket.onopen = () => {
    console.log("Client connected:", id);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      // 1️⃣ Register role
      if (msg.type === "register") {
        const role = msg.role as "broadcaster" | "listener";
        clients.set(id, { id, role, ws: socket });

        if (role === "broadcaster") broadcaster = { id, role, ws: socket };
        console.log(`🔗 ${id} registered as ${role}`);

        if (role === "listener" && broadcaster) {
          broadcaster.ws.send(JSON.stringify({ type: "new-listener", id }));
        }
        return;
      }

      // 2️⃣ Forward signaling messages
      const { target, payload, type } = msg;

      // offer -> listener
      if (type === "offer" && target) {
        const t = clients.get(target);
        if (t) t.ws.send(JSON.stringify({ type: "offer", from: id, payload }));
      }

      // answer -> broadcaster
      else if (type === "answer" && broadcaster) {
        broadcaster.ws.send(JSON.stringify({ type: "answer", from: id, payload }));
      }

      // candidate -> target
      else if (type === "candidate" && target) {
        const t = clients.get(target);
        if (t) t.ws.send(JSON.stringify({ type: "candidate", from: id, payload }));
      }

    } catch (err) {
      console.error("❌ Message error:", err);
    }
  };

  socket.onclose = () => {
    console.log("❌ Disconnected:", id);
    clients.delete(id);
    if (broadcaster?.id === id) broadcaster = null;
  };

  return response;
}, { port: 8000 });
