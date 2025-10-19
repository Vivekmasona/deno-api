// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Conn { id: string; ws: WebSocket; role?: 'broadcaster'|'listener'; }

const conns = new Map<string, Conn>();
let currentTime = 0;
let songTitle = "";

console.log("✅ Public FM Signaling Server :8000");

serve((req) => {
  // --- Allow CORS ---
  if (req.method === "OPTIONS") {
    return new Response("okay", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("FM Server Active", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const conn: Conn = { id, ws: socket };
  conns.set(id, conn);
  console.log("🟢 Connected:", id);

  socket.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const msg = JSON.parse(e.data);

    if (msg.type === "register") {
      conn.role = msg.role;
      console.log(`Registered ${id} as ${msg.role}`);
      // When new listener joins, tell broadcaster
      if (msg.role === "listener") {
        for (const c of conns.values())
          if (c.role === "broadcaster")
            c.ws.send(JSON.stringify({ type: "listener-joined", id }));
        // also send sync info
        socket.send(JSON.stringify({ type: "sync", time: currentTime, title: songTitle }));
      }
      return;
    }

    // ---- Sync from broadcaster ----
    if (msg.type === "time") {
      currentTime = msg.time;
      return;
    }

    if (msg.type === "title") {
      songTitle = msg.title;
      for (const c of conns.values())
        if (c.role === "listener")
          c.ws.send(JSON.stringify({ type: "title", title: songTitle }));
      return;
    }

    // ---- WebRTC forwarding ----
    const { type, target, payload } = msg;
    if (type === "offer") {
      const t = conns.get(target);
      if (t) t.ws.send(JSON.stringify({ type: "offer", from: id, payload }));
    }
    if (type === "answer") {
      const t = conns.get(target);
      if (t) t.ws.send(JSON.stringify({ type: "answer", from: id, payload }));
    }
    if (type === "candidate") {
      const t = conns.get(target);
      if (t) t.ws.send(JSON.stringify({ type: "candidate", from: id, payload }));
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
