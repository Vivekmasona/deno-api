// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  room: string;
}

const rooms = new Map<string, Set<Client>>();
console.log("🚀 vfy-call Signaling Server started");

serve(async (req) => {
  const upgrade = req.headers.get("upgrade") || "";
  const url = new URL(req.url);
  const room = url.searchParams.get("room") || "default";
  const clientId = crypto.randomUUID();

  // ✅ Handle CORS (for any browser)
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // ✅ Health check
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response(`✅ vfy-call signaling active: room=${room}`, { headers: cors });
  }

  // ✅ WebSocket upgrade
  const { socket, response } = Deno.upgradeWebSocket(req);
  const client: Client = { id: clientId, ws: socket, room };

  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(client);

  console.log(`👤 Joined: ${clientId} in room ${room}`);

  socket.onmessage = (e) => {
    for (const c of rooms.get(room) || []) {
      if (c.id !== clientId && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(e.data);
      }
    }
  };

  socket.onclose = () => {
    rooms.get(room)?.delete(client);
    console.log(`❌ Disconnected: ${clientId}`);
  };

  socket.onerror = (err) => console.error("⚠️ WS error:", err);
  return response;
});
