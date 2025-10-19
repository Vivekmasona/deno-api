// === vfy-call.deno.dev (Deno WebSocket Signaling Server) ===
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const rooms = new Map<string, WebSocket[]>();

serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("RTC Signaling Active", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  let roomId = "";

  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    roomId = msg.room;

    if (!rooms.has(roomId)) rooms.set(roomId, []);
    const members = rooms.get(roomId)!;

    // store socket if not already
    if (!members.includes(socket)) members.push(socket);

    // broadcast to others in same room
    for (const peer of members) {
      if (peer !== socket) peer.send(JSON.stringify(msg));
    }
  };

  socket.onclose = () => {
    if (roomId && rooms.has(roomId)) {
      rooms.set(roomId, rooms.get(roomId)!.filter((s) => s !== socket));
    }
  };

  return response;
});
