// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Conn { id: string; ws: WebSocket; role?: 'broadcaster'|'listener'; }

const conns = new Map<string, Conn>();

console.log("✅ Signaling WebSocket server running on :8000");

serve((req) => {
  // CORS preflight for any HTTP
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // If not WebSocket upgrade, simple info (includes CORS)
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket signaling server", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const conn: Conn = { id, ws: socket };
  conns.set(id, conn);
  console.log("conn open", id);

  socket.onmessage = (e) => {
    // Expect JSON messages
    try {
      // sometimes messages may be binary (ArrayBuffer) — ignore here
      if (typeof e.data !== "string") return;
      const msg = JSON.parse(e.data);
      // Register role
      if (msg.type === "register") {
        conn.role = msg.role; // 'broadcaster' or 'listener'
        console.log(`registered ${id} as ${conn.role}`);
        // If new listener and a broadcaster exists, notify broadcasters
        if (conn.role === "listener") {
          for (const c of conns.values()) {
            if (c.role === "broadcaster") {
              c.ws.send(JSON.stringify({ type: "listener-joined", id }));
            }
          }
        }
        return;
      }

      // Forward messages: include target id when appropriate
      // messages: offer -> target listener, answer -> target broadcaster, candidate -> target
      const { type, target, payload } = msg;

      if (type === "offer") {
        // forward offer to target listener
        const t = conns.get(target);
        if (t) t.ws.send(JSON.stringify({ type: "offer", from: id, payload }));
        return;
      }
      if (type === "answer") {
        // forward answer to target broadcaster
        const t = conns.get(target);
        if (t) t.ws.send(JSON.stringify({ type: "answer", from: id, payload }));
        return;
      }
      if (type === "candidate") {
        // forward candidate to target
        const t = conns.get(target);
        if (t) t.ws.send(JSON.stringify({ type: "candidate", from: id, payload }));
        return;
      }

      // control messages broadcasting to broadcaster(s)
      if (type === "broadcast-control") {
        for (const c of conns.values()) if (c.role === "listener") c.ws.send(JSON.stringify({ type: "control", payload }));
        return;
      }
    } catch (err) {
      console.error("msg parse error", err);
    }
  };

  socket.onclose = () => {
    conns.delete(id);
    console.log("conn close", id);
    // If a listener left, notify broadcasters of disconnect (optional)
    for (const c of conns.values()) {
      if (c.role === "broadcaster") {
        c.ws.send(JSON.stringify({ type: "peer-left", id }));
      }
    }
  };

  return response;
}, { port: 8000 });
