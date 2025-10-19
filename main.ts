// === Ultra-Light Deno Signaling Server ===
// Handles 1 broadcaster + unlimited listeners with ~0 load
// Run locally: deno run --allow-net main.ts
// Or deploy: https://dash.deno.com

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Conn {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
  lastPing: number;
}

const conns = new Map<string, Conn>();
console.log("✅ Optimized Live FM Signaling Server on :8000");

serve((req) => {
  // --- CORS for all HTTP requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // --- If not a websocket, just info
  if ((req.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
    return new Response("WebSocket signaling server running", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // --- Upgrade to WebSocket
  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const conn: Conn = { id, ws: socket, lastPing: Date.now() };
  conns.set(id, conn);

  console.log("🟢 Connected:", id);

  socket.onmessage = (e) => {
    try {
      if (typeof e.data !== "string") return;
      const msg = JSON.parse(e.data);

      // --- Register broadcaster / listener
      if (msg.type === "register") {
        conn.role = msg.role;
        conn.lastPing = Date.now();
        console.log(`Registered ${id} as ${conn.role}`);

        if (conn.role === "listener") {
          // Notify all broadcasters that new listener joined
          for (const c of conns.values())
            if (c.role === "broadcaster")
              c.ws.send(JSON.stringify({ type: "listener-joined", id }));
        }
        return;
      }

      // --- WebRTC message relay
      const { type, target, payload } = msg;

      if (type === "offer" || type === "answer" || type === "candidate") {
        const t = conns.get(target);
        if (t) t.ws.send(JSON.stringify({ type, from: id, payload }));
        return;
      }

      // --- Broadcast control message from broadcaster → all listeners
      if (type === "broadcast-control") {
        for (const c of conns.values())
          if (c.role === "listener")
            c.ws.send(JSON.stringify({ type: "control", payload }));
        return;
      }

      // --- Optional: heartbeat ping from client
      if (type === "ping") {
        conn.lastPing = Date.now();
        socket.send(JSON.stringify({ type: "pong" }));
      }
    } catch (_) {
      // Ignore malformed messages silently (keeps CPU low)
    }
  };

  socket.onclose = () => {
    conns.delete(id);
    console.log("🔴 Disconnected:", id);
    for (const c of conns.values())
      if (c.role === "broadcaster")
        c.ws.send(JSON.stringify({ type: "peer-left", id }));
  };

  return response;
}, { port: 8000 });

// --- Lightweight keep-alive cleanup (runs every 30 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of conns) {
    if (now - c.lastPing > 60000) {
      try { c.ws.close(); } catch {}
      conns.delete(id);
      console.log("⏱️ Auto-cleaned idle:", id);
    }
  }
}, 30000);
