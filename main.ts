// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
}

const clients = new Map<string, Client>();
let broadcasterId: string | null = null;
let lastOffer: any = null;

console.log("🎧 FM Signaling Server Running...");

serve((req) => {
  // Allow CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // WebSocket upgrade
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("FM server active", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const conn: Client = { id, ws: socket };
  clients.set(id, conn);

  socket.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const msg = JSON.parse(e.data);

    // registration
    if (msg.type === "register") {
      conn.role = msg.role;
      console.log(`🧩 ${id} registered as ${msg.role}`);

      // instantly send offer if broadcaster already live
      if (msg.role === "listener" && lastOffer && broadcasterId) {
        conn.ws.send(JSON.stringify({
          type: "offer",
          from: broadcasterId,
          payload: lastOffer
        }));
      }
      return;
    }

    // broadcaster offer
    if (msg.type === "offer") {
      broadcasterId = id;
      lastOffer = msg.payload;
      console.log("📡 Offer received from broadcaster, sending to all listeners...");
      for (const c of clients.values()) {
        if (c.role === "listener") {
          c.ws.send(JSON.stringify({ type: "offer", from: id, payload: msg.payload }));
        }
      }
      return;
    }

    // listener answer
    if (msg.type === "answer") {
      const b = clients.get(broadcasterId!);
      if (b) b.ws.send(JSON.stringify({ type: "answer", from: id, payload: msg.payload }));
      return;
    }

    // ICE candidate exchange
    if (msg.type === "candidate") {
      if (msg.target) {
        const t = clients.get(msg.target);
        if (t) t.ws.send(JSON.stringify({ type: "candidate", from: id, payload: msg.payload }));
      } else {
        for (const c of clients.values()) {
          if (c !== conn && c.role !== conn.role) {
            c.ws.send(JSON.stringify({ type: "candidate", from: id, payload: msg.payload }));
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
      console.log("❌ Broadcaster disconnected, cleared offer");
    }
  };

  return response;
}, { port: 8000 });
