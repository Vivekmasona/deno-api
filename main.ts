// deno_sync_radio.js
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const clients = new Map(); // id -> { ws, role }
const HOST = { id: null, ws: null };

function broadcast(data) {
  for (const [, c] of clients) {
    if (c.role === "listener") {
      try { c.ws.send(JSON.stringify(data)); } catch {}
    }
  }
}

serve((req) => {
  const { pathname } = new URL(req.url);

  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const id = crypto.randomUUID();
    clients.set(id, { ws: socket, role: "unknown" });

    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      // Register
      if (msg.type === "register") {
        clients.get(id).role = msg.role;

        if (msg.role === "host") {
          HOST.id = id;
          HOST.ws = socket;
          console.log("🎙️ Host connected");
        } else if (msg.role === "listener") {
          console.log("👂 Listener joined");
          // Update listener count
          if (HOST.ws) HOST.ws.send(JSON.stringify({
            type: "count",
            count: [...clients.values()].filter(c => c.role === "listener").length
          }));
          // Notify listener that connection is active
          socket.send(JSON.stringify({ type: "status", online: !!HOST.ws }));
        }
      }

      // Host controls broadcast
      if (msg.type === "control" && id === HOST.id) {
        broadcast(msg);
      }
    };

    socket.onclose = () => {
      const role = clients.get(id)?.role;
      clients.delete(id);

      if (role === "listener" && HOST.ws) {
        HOST.ws.send(JSON.stringify({
          type: "count",
          count: [...clients.values()].filter(c => c.role === "listener").length
        }));
      }

      if (role === "host") {
        console.log("❌ Host left");
        HOST.id = null;
        HOST.ws = null;
        broadcast({ type: "status", online: false });
      }
    };

    return response;
  }

  return new Response("🎧 BiharFM Sync Deno Server Online");
});
