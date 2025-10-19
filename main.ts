// === Ultra Fast Live FM Signaling Server ===
// Run: deno run --allow-net main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Conn {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
  ready?: boolean;
}

const conns = new Map<string, Conn>();

console.log("🚀 Live FM Server started (instant connect mode)");

serve((req) => {
  // --- CORS support
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // --- WebSocket upgrade
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket signaling server", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const conn: Conn = { id, ws: socket };
  conns.set(id, conn);
  console.log("🟢 Connected:", id);

  // --- Message handler
  socket.onmessage = (e) => {
    try {
      if (typeof e.data !== "string") return;
      const msg = JSON.parse(e.data);
      const { type, role, target, payload } = msg;

      // 1️⃣ Register roles
      if (type === "register") {
        conn.role = role;
        conn.ready = true;
        console.log(`📡 ${id} registered as ${role}`);

        // Immediately tell everyone the new user is ready
        if (role === "listener") {
          for (const c of conns.values()) {
            if (c.role === "broadcaster") {
              c.ws.send(JSON.stringify({ type: "listener-joined", id }));
            }
          }
        } else if (role === "broadcaster") {
          // Let all waiting listeners know broadcaster is here
          for (const c of conns.values()) {
            if (c.role === "listener") {
              c.ws.send(JSON.stringify({ type: "broadcaster-ready" }));
            }
          }
        }
        return;
      }

      // 2️⃣ Handle WebRTC exchange
      if (["offer", "answer", "candidate"].includes(type)) {
        const t = conns.get(target);
        if (t) {
          t.ws.send(JSON.stringify({ type, from: id, payload }));
        }
        return;
      }

      // 3️⃣ Broadcast control (optional)
      if (type === "broadcast-control") {
        for (const c of conns.values()) {
          if (c.role === "listener") {
            c.ws.send(JSON.stringify({ type: "control", payload }));
          }
        }
        return;
      }

      // 4️⃣ Ping/pong keepalive
      if (type === "ping") {
        conn.ws.send(JSON.stringify({ type: "pong" }));
      }
    } catch (err) {
      console.error("❌ Message error:", err);
    }
  };

  // --- Connection closed
  socket.onclose = () => {
    conns.delete(id);
    console.log("🔴 Disconnected:", id);

    // Notify broadcaster that listener left
    for (const c of conns.values()) {
      if (c.role === "broadcaster") {
        c.ws.send(JSON.stringify({ type: "peer-left", id }));
      }
    }
  };

  return response;
}, { port: 8000 });
