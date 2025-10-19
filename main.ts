// === VFY Live Audio Stream Server ===
// deploy on https://vfy-call.deno.dev
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
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

serve((req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: CORS });

  // For health check
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response(JSON.stringify({ live, title }), {
      headers: { "content-type": "application/json", ...CORS },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const client: Client = { id, ws: socket };
  clients.set(id, client);

  socket.onmessage = async (ev) => {
    if (typeof ev.data === "string") {
      const msg = JSON.parse(ev.data);
      if (msg.type === "register") {
        client.role = msg.role;
        if (msg.role === "broadcaster") {
          live = true;
          title = msg.title || "Untitled";
          console.log("🎙 Broadcaster started:", title);
        }
      }
    } else {
      // binary chunk
      if (client.role === "broadcaster") {
        for (const c of clients.values()) {
          if (c.role === "listener") {
            try { c.ws.send(ev.data); } catch {}
          }
        }
      }
    }
  };

  socket.onclose = () => {
    clients.delete(id);
    if (client.role === "broadcaster") {
      live = false;
      title = "";
      console.log("🛑 Broadcaster left");
      for (const c of clients.values()) {
        if (c.role === "listener") c.ws.send("END");
      }
    }
  };

  return response;
});
