import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
}

const clients = new Map<string, Client>();

console.log("🎧 Deno FM Signaling Server running on :8000");

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
      // Broadcast offer to all listeners
      for (const x of clients.values())
        if (x.role === "listener")
          x.ws.send(JSON.stringify({ ...msg, from: id }));
    }

    if (msg.type === "answer") {
      // Send back to broadcaster
      for (const x of clients.values())
        if (x.role === "broadcaster")
          x.ws.send(JSON.stringify({ ...msg, from: id }));
    }

    if (msg.type === "candidate") {
      // Relay candidates to all except sender
      for (const x of clients.values())
        if (x.id !== id) x.ws.send(JSON.stringify(msg));
    }
  };

  socket.onclose = () => {
    clients.delete(id);
    console.log(`❌ Client left: ${id}`);
  };

  return response;
}, { port: 8000 });
