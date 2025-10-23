// deno_server.js
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const clients = new Set<WebSocket>();

function broadcast(data) {
  for (const client of clients) {
    try {
      client.send(JSON.stringify(data));
    } catch {}
  }
}

serve((req) => {
  const { pathname } = new URL(req.url);

  // WebSocket upgrade
  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = () => clients.add(socket);
    socket.onclose = () => clients.delete(socket);
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "stream") {
        // broadcast stream URL to all listeners
        broadcast({ type: "play", url: msg.url });
      }
    };
    return response;
  }

  return new Response("🎧 BiharFM Deno Stream Server is live!", { status: 200 });
});
