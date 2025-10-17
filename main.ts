// server.ts
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { extname, join } from "https://deno.land/std@0.200.0/path/mod.ts";

interface Client {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
  ws: WebSocket;
  lastSeen: number;
}
const clients = new Map<string, Client>();

const pairCooldown = new Map<string, number>();
const ALERT_COOLDOWN_MS = 10_000; // adjust as needed (10s)

function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function safeSend(ws: WebSocket, obj: any) {
  try {
    // only send if socket open
    // In Deno WebSocket from upgrade, there is `readyState` property like browser
    // check numeric open (1)
    // but to be robust, wrap in try/catch
    if ((ws as any).readyState === (ws as any).OPEN || (ws as any).readyState === 1) {
      ws.send(JSON.stringify(obj));
    }
  } catch (_e) {}
}

function checkProximityFor(id: string) {
  const c = clients.get(id);
  if (!c || c.lat == null || c.lon == null) return;
  const now = Date.now();
  for (const [otherId, other] of clients) {
    if (otherId === id) continue;
    if (other.lat == null || other.lon == null) continue;
    const dist = metersBetween(c.lat, c.lon, other.lat, other.lon);
    if (dist <= 100) {
      const a = id < otherId ? id + "|" + otherId : otherId + "|" + id;
      const last = pairCooldown.get(a) ?? 0;
      if (now - last >= ALERT_COOLDOWN_MS) {
        pairCooldown.set(a, now);
        const payloadToThis = {
          type: "proximity",
          withId: otherId,
          withName: other.name,
          distanceMeters: Math.round(dist),
        };
        const payloadToOther = {
          type: "proximity",
          withId: id,
          withName: c.name,
          distanceMeters: Math.round(dist),
        };
        safeSend(c.ws, payloadToThis);
        safeSend(other.ws, payloadToOther);
        console.log(`Proximity alert: ${c.name} <-> ${other.name} (${Math.round(dist)} m)`);
      }
    }
  }
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/ws" && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = () => console.log("ws open");
    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "register") {
          const id = data.id ?? crypto.randomUUID();
          const name = String(data.name ?? "Unknown");
          const now = Date.now();
          const lat = data.lat != null ? Number(data.lat) : undefined;
          const lon = data.lon != null ? Number(data.lon) : undefined;
          clients.set(id, { id, name, ws: socket, lastSeen: now, lat, lon });
          safeSend(socket, { type: "registered", id, name });
          console.log("registered", id, name);
          // Immediately check proximity for this client (in case others already present)
          checkProximityFor(id);
        } else if (data.type === "update") {
          const id = String(data.id);
          const name = String(data.name ?? "Unknown");
          const lat = Number(data.lat);
          const lon = Number(data.lon);
          const now = Date.now();
          let c = clients.get(id);
          if (!c) {
            c = { id, name, ws: socket, lastSeen: now, lat, lon };
            clients.set(id, c);
          } else {
            c.name = name;
            c.ws = socket;
            c.lastSeen = now;
            c.lat = lat;
            c.lon = lon;
          }
          // Check proximity whenever an update is received
          checkProximityFor(id);
        } else if (data.type === "unregister") {
          const id = String(data.id);
          clients.delete(id);
        }
      } catch (e) {
        console.error("ws message error", e);
      }
    };
    socket.onclose = () => {
      for (const [id, c] of clients) {
        if (c.ws === socket) {
          clients.delete(id);
          console.log("client disconnected", id);
        }
      }
    };
    socket.onerror = (e) => console.error("ws error", e);
    return response;
  }

  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
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
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "application/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".png": return "image/png";
    case ".jpg": case ".jpeg": return "image/jpeg";
    default: return undefined;
  }
}

console.log("Starting server on http://localhost:8000");
await serve(handler, { port: 8000 });
