// main.ts
// Run: deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";

const clients = new Map<string, any>();
const cooldown = new Map<string, number>();
const COOLDOWN_MS = 30_000;
const RANGE = 100; // meters

function dist(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R = 6371000, toRad = (d:number)=>d*Math.PI/180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function handler(req: Request) {
  const { socket, response } = Deno.upgradeWebSocket(req);
  socket.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === "update") {
      clients.set(msg.id, { ...msg, ws: socket, last: Date.now() });
      for (const [id, c] of clients) {
        if (id === msg.id || !c.lat || !c.lon) continue;
        const d = dist(msg.lat, msg.lon, c.lat, c.lon);
        if (d <= RANGE) {
          const key = [id, msg.id].sort().join("|");
          const last = cooldown.get(key) ?? 0;
          if (Date.now() - last > COOLDOWN_MS) {
            cooldown.set(key, Date.now());
            try { c.ws.send(JSON.stringify({ type:"play", videoId: msg.videoId })); } catch {}
            try { socket.send(JSON.stringify({ type:"play", videoId: c.videoId })); } catch {}
            console.log(`Triggered play between ${id} and ${msg.id} (${Math.round(d)}m)`);
          }
        }
      }
    }
  };
  return response;
}

console.log("Server running on ws://localhost:8000/ws");
await serve(req => {
  if (req.headers.get("upgrade") === "websocket") return handler(req);
  return new Response("Proximity server running");
}, { port: 8000 });
