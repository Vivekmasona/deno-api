// main.ts
// Run: deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Mode = "sender" | "receiver";

interface Client {
  id: string;
  socket: WebSocket;
  mode: Mode;
  lat: number;
  lon: number;
  Ytid?: string;            // last Ytid the client (if sender) reported
  lastSeen: number;         // timestamp ms
  // mapping of senderId -> lastYtidReceived so we don't resend same Ytid repeatedly
  lastReceivedFrom: Map<string, string>;
}

const clients = new Map<string, Client>();

const HEARTBEAT_INTERVAL = 20_000; // server sends ping every 20s
const CLIENT_TIMEOUT = 60_000;     // consider dead if not seen for 60s
const TOLERANCE = 100;             // last-digit tolerance as requested (0..100)

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
  };
}

// convert lat/lon to integer bucket of last 5 decimals (1e5) and compare difference
function lastDigitsInt(v: number) {
  // keep sign and decimal part scaled
  return Math.round((Math.abs(v) * 1e5) % 1e5);
}
function nearBy(a: number, b: number, tol = TOLERANCE) {
  return Math.abs(lastDigitsInt(a) - lastDigitsInt(b)) <= tol;
}

// Heartbeat: remove stale clients
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of clients.entries()) {
    if (now - c.lastSeen > CLIENT_TIMEOUT) {
      try { c.socket.close(); } catch {}
      clients.delete(id);
      console.log(`⏳ Removed stale client ${id}`);
    } else {
      // send ping (lightweight)
      try {
        c.socket.send(JSON.stringify({ type: "ping", ts: now }));
      } catch (_) {}
    }
  }
}, HEARTBEAT_INTERVAL);

// Called when a sender reports a new Ytid (we will push to nearby receivers)
function pushToNearbyReceivers(sender: Client) {
  if (!sender.Ytid) return;
  for (const [id, other] of clients.entries()) {
    if (id === sender.id) continue;
    if (other.mode !== "receiver") continue;
    // check nearby using lastdigits tolerance for both lat & lon
    if (nearBy(sender.lat, other.lat) && nearBy(sender.lon, other.lon)) {
      const lastFromThisSender = other.lastReceivedFrom.get(sender.id);
      if (lastFromThisSender !== sender.Ytid) {
        // send
        try {
          other.socket.send(JSON.stringify({
            type: "play",
            from: sender.id,
            Ytid: sender.Ytid,
            ts: Date.now()
          }));
          // store last received for dedupe
          other.lastReceivedFrom.set(sender.id, sender.Ytid);
          console.log(`➡ Sent Ytid ${sender.Ytid} from ${sender.id} to receiver ${other.id}`);
        } catch (e) {
          console.warn("send to receiver failed", e);
        }
      } // else already received same id
    }
  }
}

// Haversine not required since we're using last-digit tolerance; kept simple as requested.

// WebSocket handler
function handleWs(req: Request) {
  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const client: Client = {
    id,
    socket,
    mode: "receiver",
    lat: 0,
    lon: 0,
    Ytid: undefined,
    lastSeen: Date.now(),
    lastReceivedFrom: new Map(),
  };
  clients.set(id, client);
  console.log(`+ client connected ${id}`);

  socket.onopen = () => {
    try {
      socket.send(JSON.stringify({ type: "connected", id }));
    } catch {}
  };

  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      client.lastSeen = Date.now();

      if (msg.type === "register") {
        // optional initial registration (mode can be provided)
        if (msg.mode === "sender" || msg.mode === "receiver") client.mode = msg.mode;
        client.id = msg.deviceId || client.id;
        clients.set(client.id, client);
        socket.send(JSON.stringify({ type: "registered", id: client.id }));
        return;
      }

      if (msg.type === "update") {
        // expected fields: lat, lon, mode, Ytid (if sender)
        if (typeof msg.lat === "number") client.lat = msg.lat;
        if (typeof msg.lon === "number") client.lon = msg.lon;
        if (msg.mode === "sender" || msg.mode === "receiver") client.mode = msg.mode;
        if (typeof msg.Ytid === "string") {
          // If Ytid changed compared to client's previous Ytid => treat as new and push
          const prev = client.Ytid;
          client.Ytid = msg.Ytid;
          if (client.mode === "sender" && client.Ytid && client.Ytid !== prev) {
            // immediate push to nearby receivers
            pushToNearbyReceivers(client);
          }
        }
        clients.set(client.id, client);
        return;
      }

      if (msg.type === "pong") {
        // client heartbeat reply
        client.lastSeen = Date.now();
        return;
      }

    } catch (err) {
      console.error("ws parse error", err);
    }
  };

  socket.onclose = () => {
    clients.delete(client.id);
    console.log(`- client disconnected ${client.id}`);
  };
  socket.onerror = (e) => {
    console.warn("socket error", e);
  };

  return response;
}

// HTTP routes: /ws for websocket, /check for debug
serve((req) => {
  const url = new URL(req.url);
  if (url.pathname === "/ws" && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return handleWs(req);
  }

  if (url.pathname === "/check") {
    // return snapshot of clients (light)
    const list = Array.from(clients.values()).map(c => ({
      id: c.id,
      mode: c.mode,
      lat: c.lat,
      lon: c.lon,
      Ytid: c.Ytid,
      lastSeen: new Date(c.lastSeen).toISOString()
    }));
    return new Response(JSON.stringify(list, null, 2), {
      headers: { "content-type": "application/json", ...corsHeaders() }
    });
  }

  return new Response("Realtime geo WebSocket server", { headers: corsHeaders() });
}, { port: 8000 });

console.log("Server listening on :8000");
