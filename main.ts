// === Live FM Signaling Server ===
// Run with: deno run --allow-net main.ts
// Or deploy to https://dash.deno.com

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Conn {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
}

const conns = new Map<string, Conn>();

console.log("✅ Live FM Signaling Server running on :8000");

serve((req) => {
  // --- CORS for HTTP requests
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
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Live FM Signaling Server", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const conn: Conn = { id, ws: socket };
  conns.set(id, conn);
  console.log("🟢 Connection open:", id);

  // --- When message received
  socket.onmessage = (e) => {
    try {
      if (typeof e.data !== "string") return;
      const msg = JSON.parse(e.data);

      // 1️⃣ Register connection role
      if (msg.type === "register") {
        conn.role = msg.role;
        console.log(`🟣 Registered ${id} as ${conn.role}`);

        // Notify broadcaster when a new listener joins
        if (conn.role === "listener") {
          for (const c of conns.values()) {
            if (c.role === "broadcaster") {
              c.ws.send(JSON.stringify({ type: "listener-joined", id }));
            }
          }
        }
        return;
      }

      // 2️⃣ Forward WebRTC offers/answers/candidates
      const { type, target, payload } = msg;
      if (type === "offer" || type === "answer" || type === "candidate") {
        const t = conns.get(target);
        if (t) {
          t.ws.send(JSON.stringify({ type, from: id, payload }));
        }
        return;
      }

      // 3️⃣ Broadcast control messages from broadcaster to all listeners
      if (type === "broadcast-control") {
        for (const c of conns.values()) {
          if (c.role === "listener") {
            c.ws.send(JSON.stringify({ type: "control", payload }));
          }
        }
        return;
      }
    } catch (err) {
      console.error("❌ Message parse error:", err);
    }
  };

  // --- When socket closed
  socket.onclose = () => {
    conns.delete(id);
    console.log("🔴 Connection closed:", id);

    // Notify broadcaster that listener left
    for (const c of conns.values()) {
      if (c.role === "broadcaster") {
        c.ws.send(JSON.stringify({ type: "peer-left", id }));
      }
    }
  };

  return response;
}, { port: 8000 });
