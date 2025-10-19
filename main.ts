// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
}

const clients = new Map<string, Client>();

console.log("🎧 Bot Server ready");

serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("FM bot online", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const c: Client = { id, ws: socket };
  clients.set(id, c);

  socket.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const msg = JSON.parse(e.data);

    if (msg.type === "register") {
      c.role = msg.role;
      console.log(`🧩 ${c.role} joined: ${id}`);
      return;
    }

    if (msg.type === "offer") {
      for (const x of clients.values())
        if (x.role === "listener") x.ws.send(JSON.stringify(msg));
    }

    if (msg.type === "answer") {
      for (const x of clients.values())
        if (x.role === "broadcaster") x.ws.send(JSON.stringify(msg));
    }

    if (msg.type === "candidate") {
      for (const x of clients.values())
        if (x !== c) x.ws.send(JSON.stringify(msg));
    }
  };

  socket.onclose = () => clients.delete(id);
  return response;
}, { port: 8000 });
