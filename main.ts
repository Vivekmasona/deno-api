// server.ts
// Run: deno run --allow-net --allow-read server.ts

import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { extname, join } from "https://deno.land/std@0.200.0/path/mod.ts";

// In-memory store of clients
interface Client {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
  ws: WebSocket;
  lastSeen: number;
}
const clients = new Map<string, Client>();

// cooldowns for pair alerts to avoid spamming: key "minId|maxId" => timestamp last alerted
const pairCooldown = new Map<string, number>();
const ALERT_COOLDOWN_MS = 30_000; // 30s cooldown per pair

// Haversine distance in meters
function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // earth radius meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// serve static index.html and websocket endpoint
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // WebSocket upgrade on /ws
  if (url.pathname === "/ws" && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = () => {
      console.log("ws open");
    };
    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "register") {
          // {type: 'register', id, name}
          const id = data.id ?? crypto.randomUUID();
          const name = String(data.name ?? "Unknown");
          clients.set(id, { id, name, ws: socket, lastSeen: Date.now() });
          // send ack back with assigned id
          socket.send(JSON.stringify({ type: "registered", id, name }));
          console.log("registered", id, name);
        } else if (data.type === "update") {
          // {type:'update', id, name, lat, lon}
          const id = String(data.id);
          const name = String(data.name ?? "Unknown");
          const lat = Number(data.lat);
          const lon = Number(data.lon);
          const now = Date.now();

          // ensure client in map
          let c = clients.get(id);
          if (!c) {
            c = { id, name, ws: socket, lastSeen: now };
            clients.set(id, c);
          } else {
            c.name = name;
            c.ws = socket;
            c.lastSeen = now;
          }
          c.lat = lat;
          c.lon = lon;

          // Compare to other clients
          for (const [otherId, other] of clients) {
            if (otherId === id) continue;
            if (other.lat == null || other.lon == null) continue;

            const dist = metersBetween(lat, lon, other.lat, other.lon);
            if (dist <= 100) {
              // check cooldown
              const a = id < otherId ? id + "|" + otherId : otherId + "|" + id;
              const last = pairCooldown.get(a) ?? 0;
              if (now - last >= ALERT_COOLDOWN_MS) {
                pairCooldown.set(a, now);
                // send proximity message to both
                const payloadToThis = {
                  type: "proximity",
                  withId: otherId,
                  withName: other.name,
                  distanceMeters: Math.round(dist),
                };
                const payloadToOther = {
                  type: "proximity",
                  withId: id,
                  withName: name,
                  distanceMeters: Math.round(dist),
                };
                try {
                  socket.send(JSON.stringify(payloadToThis));
                } catch (_e) {}
                try {
                  other.ws.send(JSON.stringify(payloadToOther));
                } catch (_e) {}
                console.log(`Alert: ${name} <-> ${other.name} (${Math.round(dist)} m)`);
              }
            }
          }
        } else if (data.type === "unregister") {
          const id = String(data.id);
          clients.delete(id);
        }
      } catch (e) {
        console.error("ws message error", e);
      }
    };
    socket.onclose = () => {
      // remove any clients using this socket
      for (const [id, c] of clients) {
        if (c.ws === socket) {
          clients.delete(id);
          console.log("client disconnected", id);
        }
      }
    };
    socket.onerror = (e) => {
      console.error("ws error", e);
    };
    return response;
  }

  // serve static index.html for root and other files
  let pathname = url.pathname;
  if (pathname === "/") pathname = "/index.html";
  const filePath = join(Deno.cwd(), "public", pathname);
  try {
    const file = await Deno.readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const ct = contentType(ext) ?? "application/octet-stream";
    return new Response(file, { status: 200, headers: { "content-type": ct } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function contentType(ext: string) {
  switch (ext) {
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return undefined;
  }
}

console.log("Starting server on http://localhost:8000");
await serve(handler, { port: 8000 });
