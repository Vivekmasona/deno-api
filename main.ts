// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
}

const clients = new Map<string, Client>();
console.log("🎧 FM WebRTC Server ready...");

serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("FM relay active", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const c: Client = { id, ws: socket };
  clients.set(id, c);

  socket.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const msg = JSON.parse(e.data);

    switch (msg.type) {
      case "register":
        c.role = msg.role;
        console.log(`👤 ${c.role} connected (${id})`);
        break;

      case "offer":
        for (const x of clients.values())
          if (x.role === "listener") x.ws.send(JSON.stringify(msg));
        break;

      case "answer":
        for (const x of clients.values())
          if (x.role === "broadcaster") x.ws.send(JSON.stringify(msg));
        break;

      case "candidate":
        for (const x of clients.values())
          if (x !== c) x.ws.send(JSON.stringify(msg));
        break;
    }
  };

  socket.onclose = () => {
    clients.delete(id);
    if (c.role === "broadcaster") {
      for (const x of clients.values())
        if (x.role === "listener")
          x.ws.send(JSON.stringify({ type: "offline" }));
    }
  };

  return response;
}, { port: 8000 });
