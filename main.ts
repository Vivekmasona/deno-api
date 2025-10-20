import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const rooms = new Map<string, Set<WebSocket>>();

console.log("📡 Local P2P Signaling Server running...");

serve({ port: 8080 }, (req) => {
  const url = new URL(req.url);
  const room = url.searchParams.get("room") ?? "";
  const upgrade = req.headers.get("upgrade") || "";

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (upgrade.toLowerCase() !== "websocket") return new Response("OK", { headers: cors });

  const { socket, response } = Deno.upgradeWebSocket(req);
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(socket);

  socket.onmessage = (e) => {
    for (const peer of rooms.get(room) ?? [])
      if (peer !== socket && peer.readyState === WebSocket.OPEN) peer.send(e.data);
  };

  socket.onclose = () => rooms.get(room)?.delete(socket);
  socket.onerror = (e) => console.error("WS error:", e);
  return response;
});
