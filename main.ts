// deno_sync_radio_auto.js
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const clients = new Map(); // id -> { ws, role }
const HOST = { id: null, ws: null };

// Store host's current state
let currentState = {
  url: null,
  time: 0,
  playing: false,
  lastUpdate: 0,
};

function broadcast(data) {
  for (const [, c] of clients) {
    if (c.role === "listener") {
      try { c.ws.send(JSON.stringify(data)); } catch {}
    }
  }
}

function sendTo(ws, data) {
  try { ws.send(JSON.stringify(data)); } catch {}
}

serve((req) => {
  const { pathname } = new URL(req.url);

  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const id = crypto.randomUUID();
    clients.set(id, { ws: socket, role: "unknown" });

    socket.onmessage = async (e) => {
      const msg = JSON.parse(e.data);

      // Register client
      if (msg.type === "register") {
        clients.get(id).role = msg.role;

        if (msg.role === "host") {
          HOST.id = id;
          HOST.ws = socket;
          console.log("🎙️ Host connected");
        }

        if (msg.role === "listener") {
          console.log("👂 Listener joined");

          // Send current host state if available
          if (currentState.url) {
            sendTo(socket, {
              type: "control",
              action: "load",
              url: currentState.url,
            });
            // Calculate approximate current time (based on last update)
            const elapsed = (Date.now() - currentState.lastUpdate) / 1000;
            const estimatedTime = currentState.time + (currentState.playing ? elapsed : 0);
            sendTo(socket, {
              type: "control",
              action: "sync",
              time: estimatedTime,
            });
            if (currentState.playing)
              sendTo(socket, { type: "control", action: "play" });
          }

          // Notify host about listener count
          if (HOST.ws) {
            const count = [...clients.values()].filter(c => c.role === "listener").length;
            sendTo(HOST.ws, { type: "count", count });
          }

          // Status update
          sendTo(socket, { type: "status", online: !!HOST.ws });
        }
      }

      // Host controls
      if (msg.type === "control" && id === HOST.id) {
        // Update current state
        if (msg.action === "load") {
          currentState.url = msg.url;
          currentState.time = 0;
          currentState.playing = true;
          currentState.lastUpdate = Date.now();
        }
        if (msg.action === "play") {
          currentState.playing = true;
          currentState.lastUpdate = Date.now();
        }
        if (msg.action === "pause") {
          currentState.playing = false;
          currentState.time = msg.time ?? currentState.time;
          currentState.lastUpdate = Date.now();
        }
        if (msg.action === "sync") {
          currentState.time = msg.time;
          currentState.lastUpdate = Date.now();
        }

        // Broadcast to all listeners
        broadcast(msg);
      }
    };

    socket.onclose = () => {
      const role = clients.get(id)?.role;
      clients.delete(id);

      if (role === "listener" && HOST.ws) {
        const count = [...clients.values()].filter(c => c.role === "listener").length;
        sendTo(HOST.ws, { type: "count", count });
      }

      if (role === "host") {
        console.log("❌ Host disconnected");
        HOST.id = null;
        HOST.ws = null;
        broadcast({ type: "status", online: false });
      }
    };

    return response;
  }

  return new Response("🎧 BiharFM AutoSync Server Live");
});
