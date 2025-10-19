// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Conn { id: string; ws: WebSocket; role?: 'broadcaster'|'listener'; }
const conns = new Map<string, Conn>();
let lastOffer: any = null; // 🆕 store latest broadcaster offer

console.log("🚀 FastConnect FM server on :8000");

serve((req) => {
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
    return new Response("FM WebRTC signaling server", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const conn: Conn = { id, ws: socket };
  conns.set(id, conn);

  socket.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const msg = JSON.parse(e.data);

    if (msg.type === "register") {
      conn.role = msg.role;
      if (conn.role === "listener") {
        console.log("👂 new listener", id);
        // 🟢 send latest offer instantly if available
        if (lastOffer) {
          conn.ws.send(JSON.stringify({ type: "offer", from: lastOffer.from, payload: lastOffer.payload }));
        }
      }
      return;
    }

    // 🛰️ save latest offer
    if (msg.type === "offer") {
      lastOffer = { from: id, payload: msg.payload };
      // broadcast offer to all listeners instantly
      for (const c of conns.values()) {
        if (c.role === "listener") {
          c.ws.send(JSON.stringify({ type: "offer", from: id, payload: msg.payload }));
        }
      }
      return;
    }

    if (msg.type === "answer") {
      const t = conns.get(msg.target);
      if (t) t.ws.send(JSON.stringify({ type: "answer", from: id, payload: msg.payload }));
      return;
    }

    if (msg.type === "candidate") {
      const t = conns.get(msg.target);
      if (t) t.ws.send(JSON.stringify({ type: "candidate", from: id, payload: msg.payload }));
    }
  };

  socket.onclose = () => conns.delete(id);
  return response;
}, { port: 8000 });
