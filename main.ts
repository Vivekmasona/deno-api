// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const rooms = new Map<string, WebSocket[]>();

serve((req) => {
  const { searchParams } = new URL(req.url);
  const room = searchParams.get("room");
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() != "websocket") {
    return new Response("Signal server running", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  socket.onopen = () => {
    if (!room) return;
    if (!rooms.has(room)) rooms.set(room, []);
    rooms.get(room)?.push(socket);
  };

  socket.onmessage = (e) => {
    const peers = rooms.get(room!) || [];
    for (const peer of peers) {
      if (peer !== socket) peer.send(e.data);
    }
  };

  socket.onclose = () => {
    const peers = rooms.get(room!) || [];
    rooms.set(room!, peers.filter(p => p !== socket));
  };

  return response;
});
