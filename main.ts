// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
}

const clients = new Map<string, Client>();
let lastOffer: any = null;
let broadcasterId: string | null = null;

console.log("🎧 FM signaling server live...");

serve((req) => {
  // ---- CORS ----
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("FM Signaling Online ok", {
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

    // --- registration ---
    if (msg.type === "register") {
      c.role = msg.role;
      console.log("🔗", c.role, "connected:", id);

      // if listener joins and we already have an offer
      if (c.role === "listener" && lastOffer) {
        c.ws.send(JSON.stringify({ type: "offer", from: broadcasterId, payload: lastOffer }));
      }
      return;
    }

    // --- broadcaster sends offer ---
    if (msg.type === "offer") {
      broadcasterId = id;
      lastOffer = msg.payload;
      console.log("📡 offer saved from broadcaster");

      // send offer to all listeners
      for (const x of clients.values()) {
        if (x.role === "listener") {
          x.ws.send(JSON.stringify({ type: "offer", from: id, payload: msg.payload }));
        }
      }
      return;
    }

    // --- listener sends answer ---
    if (msg.type === "answer") {
      const target = clients.get(broadcasterId!);
      if (target) target.ws.send(JSON.stringify({ type: "answer", from: id, payload: msg.payload }));
      return;
    }

    // --- ICE candidate ---
    if (msg.type === "candidate") {
      if (msg.target) {
        const t = clients.get(msg.target);
        if (t) t.ws.send(JSON.stringify({ type: "candidate", from: id, payload: msg.payload }));
      } else {
        // broadcast to opposite role
        for (const x of clients.values()) {
          if (x !== c && x.role !== c.role) {
            x.ws.send(JSON.stringify({ type: "candidate", from: id, payload: msg.payload }));
          }
        }
      }
    }
  };

  socket.onclose = () => {
    clients.delete(id);
    if (id === broadcasterId) {
      broadcasterId = null;
      lastOffer = null;
      console.log("❌ Broadcaster left, cleared offer");
    }
  };

  return response;
}, { port: 8000 });
