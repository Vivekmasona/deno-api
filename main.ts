// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
}

const clients = new Map<string, Client>();
let currentMeta: any = null; // song info + currentTime

console.log("🎧 Fast FM Server started...");

serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("FM server online", {
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

    switch (msg.type) {
      case "register":
        client.role = msg.role;
        console.log(`🧩 ${msg.role} joined: ${id}`);
        if (msg.role === "listener" && currentMeta) {
          // Send latest song info and time
          socket.send(JSON.stringify({ type: "meta", ...currentMeta }));
        }
        break;

      case "offer":
        for (const c of clients.values())
          if (c.role === "listener") c.ws.send(JSON.stringify(msg));
        break;

      case "answer":
        for (const c of clients.values())
          if (c.role === "broadcaster") c.ws.send(JSON.stringify(msg));
        break;

      case "candidate":
        for (const c of clients.values())
          if (c !== client) c.ws.send(JSON.stringify(msg));
        break;

      case "meta": // title + currentTime update
        currentMeta = msg;
        for (const c of clients.values())
          if (c.role === "listener") c.ws.send(JSON.stringify(msg));
        break;
    }
  };

  socket.onclose = () => clients.delete(id);
  return response;
}, { port: 8000 });
