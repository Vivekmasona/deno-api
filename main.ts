import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Conn {
  id: string;
  ws: WebSocket;
  role: "broadcaster" | "listener";
}

const conns = new Map<string, Conn>();
let lastOffer: any = null; // cache last broadcaster offer

console.log("🎧 Ultra FM Server ready (instant connect)");

serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("🎧 FM Relay Active", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  let role: "broadcaster" | "listener" | null = null;

  socket.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const msg = JSON.parse(e.data);

    if (msg.type === "register") {
      role = msg.role;
      conns.set(id, { id, ws: socket, role });
      console.log(`🧩 ${role} joined (${id.slice(0, 6)})`);

      // 🔁 auto send latest offer instantly to new listeners
      if (role === "listener" && lastOffer) {
        socket.send(JSON.stringify(lastOffer));
      }
      return;
    }

    if (msg.type === "offer" && role === "broadcaster") {
      lastOffer = msg; // cache offer for future listeners
      for (const c of conns.values()) {
        if (c.role === "listener") c.ws.send(JSON.stringify(msg));
      }
    }

    if (msg.type === "answer" && role === "listener") {
      for (const c of conns.values()) {
        if (c.role === "broadcaster") c.ws.send(JSON.stringify(msg));
      }
    }

    if (msg.type === "candidate") {
      for (const c of conns.values()) {
        if (c.id !== id) c.ws.send(JSON.stringify(msg));
      }
    }
  };

  socket.onclose = () => {
    conns.delete(id);
    console.log(`❌ disconnected (${id.slice(0, 6)})`);
  };

  return response;
});
