// === Global Auto FM Server ===
// Run on Deno Deploy or local Deno: deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const clients = new Set<WebSocket>();

serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Global FM server active", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  clients.add(socket);

  socket.onmessage = (e) => {
    // forward same message to everyone else
    for (const c of clients) {
      if (c !== socket) c.send(e.data);
    }
  };

  socket.onclose = () => clients.delete(socket);

  return response;
});
