// main.ts — Deno WebSocket + location-based music pairing
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  socket: WebSocket;
  mode: "sender" | "receiver";
  lat: number;
  lon: number;
  Ytid?: string;
}

const clients = new Map<string, Client>();

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
  };
}

function nearMatch(a: number, b: number, diff = 10) {
  return Math.abs(Math.round((a * 10000) % 10000) - Math.round((b * 10000) % 10000)) <= diff;
}

serve((req) => {
  const { pathname } = new URL(req.url);
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: cors() });

  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);

    const id = crypto.randomUUID();
    let client: Client = { id, socket, mode: "receiver", lat: 0, lon: 0 };

    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "update") {
          client.lat = msg.lat;
          client.lon = msg.lon;
          client.mode = msg.mode;
          client.Ytid = msg.Ytid;
          clients.set(id, client);

          // match logic
          if (client.mode === "sender" && client.Ytid) {
            for (const other of clients.values()) {
              if (
                other.mode === "receiver" &&
                nearMatch(client.lat, other.lat) &&
                nearMatch(client.lon, other.lon)
              ) {
                console.log(`🎯 Matched sender ${client.id} → receiver ${other.id}`);
                other.socket.send(JSON.stringify({
                  type: "play",
                  from: client.id,
                  Ytid: client.Ytid,
                }));
              }
            }
          }
        }
      } catch (e) {
        console.error("Error:", e);
      }
    };

    socket.onclose = () => clients.delete(id);
    return response;
  }

  // Debug endpoint
  if (pathname === "/check") {
    return new Response(JSON.stringify([...clients.values()].map(c => ({
      id: c.id, mode: c.mode, lat: c.lat, lon: c.lon, Ytid: c.Ytid
    })), null, 2), {
      headers: { "content-type": "application/json", ...cors() },
    });
  }

  return new Response("🎵 WebSocket geo-sync active", { headers: cors() });
});
