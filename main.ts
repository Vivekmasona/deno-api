// main.ts
// Run: deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  ws: WebSocket;
  mode: "share" | "receive";
  lat?: number;
  lon?: number;
  lastSeen: number;
}

const clients = new Map<string, Client>();
const PAIR_COOLDOWN = 20_000; // ms
const pairCooldown = new Map<string, number>();

function now() { return Date.now(); }

// Haversine distance in meters
function metersBetween(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R = 6371000;
  const toRad = (d:number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function handleWS(req: Request) {
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => { /* noop */ };

  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      const nowTs = now();

      if (data.type === "register") {
        const id = String(data.id || crypto.randomUUID());
        clients.set(id, { id, ws: socket, mode: "receive", lastSeen: nowTs });
        // ack with assigned id (so client can store)
        socket.send(JSON.stringify({ type: "registered", id }));
        console.log("registered", id);
        return;
      }

      if (data.type === "mode") {
        const id = String(data.id);
        const c = clients.get(id);
        if (c) { c.mode = data.mode === "share" ? "share" : "receive"; c.lastSeen = nowTs; }
        return;
      }

      if (data.type === "locupdate") {
        const id = String(data.id);
        const c = clients.get(id);
        if (c) { c.lat = Number(data.lat); c.lon = Number(data.lon); c.lastSeen = nowTs; }
        return;
      }

      // announce: sender asks server to forward its Ytid to nearby receivers
      if (data.type === "announce") {
        const id = String(data.id);
        const Ytid = String(data.Ytid || "");
        const lat = Number(data.lat);
        const lon = Number(data.lon);
        if (!Ytid || Ytid.length !== 11) return;
        // update announcer loc
        const announcer = clients.get(id);
        if (announcer) { announcer.lat = lat; announcer.lon = lon; announcer.lastSeen = nowTs; }

        // find nearby receivers and forward
        for (const [otherId, other] of clients.entries()) {
          if (otherId === id) continue;
          if (!other.lat || !other.lon) continue;
          if (other.mode !== "receive") continue; // only forward to receivers
          const d = metersBetween(lat, lon, other.lat!, other.lon!);
          if (d <= 100) {
            const key = [id, otherId].sort().join("|");
            const last = pairCooldown.get(key) ?? 0;
            if (nowTs - last < PAIR_COOLDOWN) continue;
            pairCooldown.set(key, nowTs);
            // forward play message
            try {
              other.ws.send(JSON.stringify({ type: "play", from: id, Ytid }));
            } catch (_e) {}
            // notify announcer someone was forwarded to (optional)
            try {
              socket.send(JSON.stringify({ type: "forwarded", to: otherId, Ytid }));
            } catch (_e) {}
            console.log(`forwarded ${Ytid} from ${id} -> ${otherId} (${Math.round(d)}m)`);
          }
        }
        return;
      }

    } catch (err) {
      console.error("ws msg parse error", err);
    }
  };

  socket.onclose = () => {
    // remove any clients that used this socket
    for (const [id, c] of clients.entries()) {
      if (c.ws === socket) clients.delete(id);
    }
  };

  socket.onerror = (e) => {
    console.error("ws error", e);
  };

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
