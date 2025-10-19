// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
}

const clients = new Map<string, Client>();
let currentTime = 0; // seconds
let title = "";

console.log("🎧 Public FM Server running...");

serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("FM server live", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const client: Client = { id, ws: socket };
  clients.set(id, client);

  socket.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const msg = JSON.parse(e.data);

    if (msg.type === "register") {
      client.role = msg.role;
      socket.send(JSON.stringify({ type: "sync", title, time: currentTime }));
      console.log(`🧩 ${msg.role} joined: ${id}`);
      return;
    }

    if (msg.type === "offer") {
      for (const c of clients.values())
        if (c.role === "listener") c.ws.send(JSON.stringify(msg));
    }

    if (msg.type === "answer") {
      for (const c of clients.values())
        if (c.role === "broadcaster") c.ws.send(JSON.stringify(msg));
    }

    if (msg.type === "candidate") {
      for (const c of clients.values())
        if (c !== client) c.ws.send(JSON.stringify(msg));
    }

    if (msg.type === "time") {
      currentTime = msg.time;
    }

    if (msg.type === "title") {
      title = msg.title;
      for (const c of clients.values())
        if (c.role === "listener")
          c.ws.send(JSON.stringify({ type: "title", title }));
    }
  };

  socket.onclose = () => clients.delete(id);
  return response;
});
