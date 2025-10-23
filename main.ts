// deno_radio_sync_final.js
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const clients = new Map(); // id -> { ws, role }
const HOST = { id: null, ws: null };

// store last known song state
let currentState = {
  url: null,
  time: 0,
  playing: false,
  lastUpdate: 0,
};

// send helper
function send(ws, data) {
  try { ws.send(JSON.stringify(data)); } catch {}
}

// broadcast to all listeners
function broadcast(data) {
  for (const [, c] of clients)
    if (c.role === "listener") send(c.ws, data);
}

serve((req) => {
  const { pathname } = new URL(req.url);

  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const id = crypto.randomUUID();
    clients.set(id, { ws: socket, role: "unknown" });

    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      // Register role
      if (msg.type === "register") {
        clients.get(id).role = msg.role;

        if (msg.role === "host") {
          HOST.id = id;
          HOST.ws = socket;
          console.log("🎙️ Host connected");
        }

        if (msg.role === "listener") {
          console.log("👂 New listener joined");

          // Send host state only once (for new user sync)
          if (currentState.url) {
            // calculate approximate position if playing
            const elapsed = (Date.now() - currentState.lastUpdate) / 1000;
            const pos = currentState.playing
              ? currentState.time + elapsed
              : currentState.time;

            send(socket, { type: "control", action: "load", url: currentState.url });
            send(socket, { type: "control", action: "sync", time: pos });
            if (currentState.playing)
              send(socket, { type: "control", action: "play" });
          }

          // update listener count to host
          if (HOST.ws) {
            const count = [...clients.values()].filter(c => c.role === "listener").length;
            send(HOST.ws, { type: "count", count });
          }
        }
      }

      // Host controls
      if (msg.type === "control" && id === HOST.id) {
        // Update host state only for control events
        if (msg.action === "load") {
          currentState = {
            url: msg.url,
            time: 0,
            playing: true,
            lastUpdate: Date.now(),
          };
        }
        if (msg.action === "play") {
          currentState.playing = true;
          currentState.lastUpdate = Date.now();
        }
        if (msg.action === "pause") {
          currentState.playing = false;
          currentState.time = msg.time;
          currentState.lastUpdate = Date.now();
        }
        if (msg.action === "seek") {
          currentState.time = msg.time;
          currentState.lastUpdate = Date.now();
        }

        broadcast(msg); // send to all listeners
      }
    };

    socket.onclose = () => {
      const role = clients.get(id)?.role;
      clients.delete(id);

      if (role === "listener" && HOST.ws) {
        const count = [...clients.values()].filter(c => c.role === "listener").length;
        send(HOST.ws, { type: "count", count });
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

  return new Response("🎧 BiharFM Optimized AutoSync Server Running");
});
