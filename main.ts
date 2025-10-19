// === VFY Auto-Live FM Server ===
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
}
const clients = new Map<string, Client>();
let live = false;
let title = "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "*",
};

serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (req.headers.get("upgrade") !== "websocket") {
    return new Response(JSON.stringify({ live, title }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const client: Client = { id, ws: socket };
  clients.set(id, client);

  socket.onmessage = async (e) => {
    if (typeof e.data === "string") {
      const msg = JSON.parse(e.data);

      if (msg.type === "register") {
        client.role = msg.role;
        if (msg.role === "broadcaster") {
          live = true;
          title = msg.title || "Live Stream";
          // सभी listeners को नया title भेजो
          broadcast({ type: "title", title });
          console.log("🎙️ Broadcaster:", title);
        } else {
          // listener connected -> status भेजो
          socket.send(JSON.stringify({ type: "title", title, live }));
        }
      }

      if (msg.type === "title") {
        title = msg.title;
        broadcast({ type: "title", title });
      }
    } else {
      // audio chunk (binary)
      if (client.role === "broadcaster") {
        broadcast(e.data, "listener");
      }
    }
  };

  socket.onclose = () => {
    clients.delete(id);
    if (client.role === "broadcaster") {
      live = false;
      title = "";
      broadcast({ type: "offline" });
      console.log("🛑 Broadcaster left");
    }
  };

  return response;
});

function broadcast(data: any, to?: "listener" | "broadcaster") {
  for (const c of clients.values()) {
    if (!to || c.role === to) {
      try {
        if (data instanceof Uint8Array) c.ws.send(data);
        else c.ws.send(JSON.stringify(data));
      } catch {}
    }
  }
}
