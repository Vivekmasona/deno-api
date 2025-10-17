// main.ts
// deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  // optional last known location (for passive matching if desired)
  lat?: number;
  lon?: number;
  lastSeen: number;
}

const clients = new Map<string, Client>();
const PER_PAIR_COOLDOWN = 20_000; // 20s per pair
const pairCooldown = new Map<string, number>();

function metersBetween(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R = 6371000;
  const toRad = (d:number)=>d*Math.PI/180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function handleWS(req: Request) {
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => { /* noop */ };

  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      const now = Date.now();

      if (data.type === "register") {
        const id = String(data.id || crypto.randomUUID());
        clients.set(id, { id, ws: socket, lastSeen: now, lat: data.lat, lon: data.lon });
        // ack
        socket.send(JSON.stringify({ type: "registered", id }));
        console.log("registered", id);
        return;
      }

      if (data.type === "announce") {
        // announce: { type: "announce", id, lat, lon, Ytid }
        const id = String(data.id || crypto.randomUUID());
        const lat = Number(data.lat);
        const lon = Number(data.lon);
        const Ytid = String(data.Ytid || "");
        // update caller lastSeen/loc
        const caller = clients.get(id);
        if (caller) { caller.lastSeen = now; caller.lat = lat; caller.lon = lon; }
        // find nearby clients (only among currently connected ones)
        for (const [otherId, other] of clients.entries()) {
          if (otherId === id) continue;
          if (other.lat == null || other.lon == null) continue;
          const d = metersBetween(lat, lon, other.lat, other.lon);
          if (d <= 100) {
            // cooldown per pair
            const key = [id, otherId].sort().join("|");
            const last = pairCooldown.get(key) ?? 0;
            if (now - last < PER_PAIR_COOLDOWN) continue;
            pairCooldown.set(key, now);
            // Forward to other: one-shot play message
            try {
              other.ws.send(JSON.stringify({ type: "play", from: id, Ytid }));
            } catch (e) { /* ignore */ }
            // also optionally inform announcer that forward sent
            try {
              socket.send(JSON.stringify({ type: "forwarded", to: otherId }));
            } catch (e) {}
            console.log(`forwarded Ytid ${Ytid} from ${id} -> ${otherId} (d=${Math.round(d)}m)`);
          }
        }
        return;
      }

      if (data.type === "locupdate") {
        // optional: clients can send locupdates infrequently to aid matching later
        const id = String(data.id);
        const c = clients.get(id);
        if (c) { c.lat = Number(data.lat); c.lon = Number(data.lon); c.lastSeen = now; }
        return;
      }

    } catch (err) {
      console.error("ws parse error", err);
    }
  };

  socket.onclose = () => {
    // remove client(s) that used this socket
    for (const [id, c] of clients.entries()) {
      if (c.ws === socket) clients.delete(id);
    }
  };

  socket.onerror = (e) => console.error("ws err", e);

  return response;
}

serve((req) => {
  const url = new URL(req.url);
  if (url.pathname === "/ws" && req.headers.get("upgrade") === "websocket") {
    return handleWS(req);
  }
  return new Response("Proximity relay WS running");
}, { port: 8000 });

console.log("Server running ws://localhost:8000/ws");
