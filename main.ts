// main.ts
import { serve } from "https://deno.land/std/http/server.ts";

// Map of all connected clients
const clients = new Map<string, { ws: WebSocket; role?: string }>();

// Helper: Safe send to any socket
function safeSend(ws: WebSocket, data: unknown) {
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  } catch (_) {
    // ignore send errors
  }
}

// Generate UUID (Deno has built-in crypto)
function uid() {
  return crypto.randomUUID();
}

console.log("🎧 FM Deno Signaling Server Ready");

serve((req) => {
  // Handle non-WebSocket requests (CORS preflight + info)
  if (req.headers.get("upgrade") !== "websocket") {
    const headers = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });

    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    return new Response("🎧 Deno FM WebRTC Signaling Server Live!", {
      headers,
    });
  }

  // Upgrade HTTP to WebSocket
  const { socket, response } = Deno.upgradeWebSocket(req, { idleTimeout: 120 });

  const id = uid();
  clients.set(id, { ws: socket });
  console.log("🔗 Connected:", id);

  // Send ack
  safeSend(socket, { type: "connected", id });

  // Handle messages
  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      const { type, role, target, payload } = msg;

      // Register role
      if (type === "register") {
        clients.get(id)!.role = role;
        console.log(`🧩 ${id} registered as ${role}`);

        // Notify broadcaster about listener join
        if (role === "listener") {
          for (const [, c] of clients)
            if (c.role === "broadcaster")
              safeSend(c.ws, { type: "listener-joined", id });
        }
      }

      // Relay offer/answer/candidate
      if (["offer", "answer", "candidate"].includes(type) && target) {
        const t = clients.get(target);
        if (t) safeSend(t.ws, { type, from: id, payload });
      }
    } catch (err) {
      console.error("⚠️ Parse error:", err);
    }
  };

  // Handle close
  socket.onclose = () => {
    clients.delete(id);
    console.log("❌ Disconnected:", id);

    // Notify broadcaster if listener left
    for (const [, c] of clients)
      if (c.role === "broadcaster")
        safeSend(c.ws, { type: "peer-left", id });
  };

  // Handle error safely
  socket.onerror = (err) => {
    console.error("💥 Socket error:", err);
    try {
      socket.close();
    } catch (_) {}
    clients.delete(id);
  };

  return response;
});
