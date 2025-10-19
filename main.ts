// === FM Relay Server ===
// Run: deno run --allow-net server.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
}

const clients = new Map<string, Client>();
let currentOffer: any = null; // Store broadcaster offer
let iceCandidates: any[] = []; // Relay ICE candidates

console.log("🎧 FM Multi-Listener Server Running...");

serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("FM relay active", {
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

      // New listener gets current offer if broadcaster live
      if (c.role === "listener" && currentOffer) {
        c.ws.send(JSON.stringify({ type: "offer", payload: currentOffer }));
        iceCandidates.forEach(ic =>
          c.ws.send(JSON.stringify({ type: "candidate", payload: ic }))
        );
      }
      return;
    }

    if (msg.type === "offer" && c.role === "broadcaster") {
      currentOffer = msg.payload;
      console.log("📡 Broadcaster Live");
      // Send offer to all listeners
      for (const x of clients.values())
        if (x.role === "listener")
          x.ws.send(JSON.stringify(msg));
    }

    if (msg.type === "answer" && c.role === "listener") {
      // Send answer back to broadcaster only
      for (const x of clients.values())
        if (x.role === "broadcaster")
          x.ws.send(JSON.stringify(msg));
    }

    if (msg.type === "candidate") {
      // Save ICE candidates for replay
      iceCandidates.push(msg.payload);
      for (const x of clients.values())
        if (x !== c)
          x.ws.send(JSON.stringify(msg));
    }
  };

  socket.onclose = () => {
    clients.delete(id);
    if (c.role === "broadcaster") {
      currentOffer = null;
      iceCandidates = [];
      for (const x of clients.values())
        if (x.role === "listener")
          x.ws.send(JSON.stringify({ type: "offline" }));
      console.log("❌ Broadcaster disconnected");
    }
  };

  return response;
}, { port: 8000 });
