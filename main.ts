// deno run --allow-net main.ts
import { serve } from "https://deno.land/std/http/server.ts";

interface Client {
  id: string;
  socket: WebSocket;
  session?: string;
}

const clients: Client[] = [];

serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("WebSocket only", { status: 400 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const client: Client = { id, socket };
  clients.push(client);

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "join") {
        client.session = msg.session;
      }
      // broadcast within same session
      clients.forEach((c) => {
        if (c !== client && c.session === client.session) {
          c.socket.send(e.data);
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  socket.onclose = () => {
    const i = clients.indexOf(client);
    if (i >= 0) clients.splice(i, 1);
  };

  return response;
});
