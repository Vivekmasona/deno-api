import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface RoomMap {
  [key: string]: WebSocket[];
}

const rooms: RoomMap = {};

console.log("🚀 Signaling Server started on Deno...");

serve((req) => {
  const { searchParams } = new URL(req.url);
  const room = searchParams.get("room");
  const upgrade = req.headers.get("upgrade") || "";

  // ✅ CORS fix
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };

  // ✅ Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ✅ Normal request (for testing)
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("✅ Deno WebRTC Signaling Server running!", {
      headers: corsHeaders,
    });
  }

  // ✅ WebSocket upgrade
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    console.log("🔗 Client joined:", room);
    if (!room) return;
    rooms[room] ??= [];
    rooms[room].push(socket);
  };

  socket.onmessage = (event) => {
    if (!room) return;
    const peers = rooms[room] || [];
    for (const peer of peers) {
      if (peer !== socket && peer.readyState === WebSocket.OPEN) {
        peer.send(event.data);
      }
    }
  };

  socket.onclose = () => {
    if (room && rooms[room]) {
      rooms[room] = rooms[room].filter((s) => s !== socket);
      if (rooms[room].length === 0) delete rooms[room];
    }
    console.log("❌ Disconnected:", room);
  };

  socket.onerror = (err) => console.error("⚠️ WebSocket error:", err);

  return response;
});
