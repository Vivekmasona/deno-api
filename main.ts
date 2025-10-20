import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const rooms = new Map<string, WebSocket[]>();

console.log("🚀 P2P Signaling Server ready on Deno");

serve((req) => {
  const url = new URL(req.url);
  const room = url.searchParams.get("room") ?? "";
  const upgrade = req.headers.get("upgrade") || "";

  // ✅ CORS allow
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("✅ Signaling Server Running", { headers: corsHeaders });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    if (!room) return;
    if (!rooms.has(room)) rooms.set(room, []);
    rooms.get(room)!.push(socket);
    console.log("🔗 New client joined room:", room);
  };

  socket.onmessage = (e) => {
    if (!room) return;
    const peers = rooms.get(room) || [];
    for (const peer of peers) {
      if (peer !== socket && peer.readyState === WebSocket.OPEN) {
        peer.send(e.data);
      }
    }
  };

  socket.onclose = () => {
    if (room && rooms.has(room)) {
      const arr = rooms.get(room)!.filter((p) => p !== socket);
      arr.length ? rooms.set(room, arr) : rooms.delete(room);
    }
  };

  socket.onerror = (e) => console.error("⚠️ WS error:", e);

  return response;
});
