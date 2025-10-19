// === WebSocket FM Audio Stream Server ===
// deno run --allow-net server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  role?: "broadcaster" | "listener";
}

const clients = new Map<string, Client>();
let live = false;
let title = "";

console.log("🎧 FM WebSocket Server Ready");

serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response(JSON.stringify({ live, title }), {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const c: Client = { id, ws: socket };
  clients.set(id, c);

  socket.onmessage = (e) => {
    if (typeof e.data === "string") {
      const msg = JSON.parse(e.data);
      if (msg.type === "register") {
        c.role = msg.role;
        if (c.role === "broadcaster") {
          title = msg.title || "Untitled";
          live = true;
        }
        console.log("📡", c.role, "joined");
      }
    } else {
      // binary chunk (audio)
      if (c.role === "broadcaster") {
        for (const x of clients.values()) {
          if (x.role === "listener") {
            x.ws.send(e.data);
          }
        }
      }
    }
  };

  socket.onclose = () => {
    clients.delete(id);
    if (c.role === "broadcaster") {
      live = false;
      title = "";
      console.log("🛑 Broadcaster left");
      for (const x of clients.values()) {
        if (x.role === "listener") x.ws.send("END");
      }
    }
  };

  return response;
}, { port: 8000 });
