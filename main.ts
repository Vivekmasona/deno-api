// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  lat?: number;
  lon?: number;
  mode: "share" | "receive";
}

const clients = new Map<string, Client>();
const PER_PAIR_COOLDOWN = 30_000;
const cooldown = new Map<string, number>();

function distance(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R=6371000,toRad=(d:number)=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function handleWS(req: Request) {
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      const id = data.id || crypto.randomUUID();

      if (data.type === "register") {
        clients.set(id, { id, ws: socket, mode: "receive" });
        socket.send(JSON.stringify({ type: "registered", id }));
        return;
      }

      if (data.type === "mode") {
        const c = clients.get(id);
        if (c) c.mode = data.mode;
        return;
      }

      if (data.type === "announce") {
        const c = clients.get(id);
        if (!c) return;
        c.lat = data.lat;
        c.lon = data.lon;

        for (const [oid, other] of clients) {
          if (oid === id || !other.lat || !other.lon) continue;
          if (other.mode !== "receive") continue; // sirf receiver devices
          const dist = distance(c.lat!, c.lon!, other.lat, other.lon);
          const key = [id, oid].sort().join("|");
          const now = Date.now();
          if (dist < 100 && (!cooldown.has(key) || now - (cooldown.get(key) ?? 0) > PER_PAIR_COOLDOWN)) {
            cooldown.set(key, now);
            other.ws.send(JSON.stringify({ type: "play", from: id, Ytid: data.Ytid }));
            socket.send(JSON.stringify({ type: "shared", to: oid }));
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  socket.onclose = () => {
    for (const [id, c] of clients) if (c.ws === socket) clients.delete(id);
  };

  return response;
}

serve((req) => {
  const url = new URL(req.url);
  if (url.pathname === "/ws" && req.headers.get("upgrade") === "websocket") return handleWS(req);
  return new Response("✅ FAFA Network Relay running");
});
