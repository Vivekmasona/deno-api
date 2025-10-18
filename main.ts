// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// ---------- CONFIG ----------
const PORT = 8000;
const CELL_SIZE = 0.001;      // degrees (≈111m). adjust smaller for tighter match
const DISTANCE_THRESHOLD_M = 120; // meters allowed for "nearby"
const HEARTBEAT_MS = 20000;
const CLIENT_TIMEOUT_MS = 90_000;
const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 1200;
// ----------------------------

type Mode = "sender" | "receiver";

interface Client {
  id: string;
  socket: WebSocket;
  mode: Mode;
  lat: number;
  lon: number;
  cellKey: string | null;
  Ytid?: string;                    // last Ytid reported (for sender)
  lastSeen: number;
  // for receivers: map senderId -> lastYtid acked
  lastReceivedFrom: Map<string, string>;
  // outstanding deliveries: seq -> {senderId, ytid, tries, timeout}
  outstanding: Map<number, { senderId: string; ytid: string; tries: number; timer?: number }>;
}

const clients = new Map<string, Client>();
let seqCounter = 1;

// Helpers
function cellKeyFor(lat: number, lon: number) {
  const cx = Math.floor(lat / CELL_SIZE);
  const cy = Math.floor(lon / CELL_SIZE);
  return `${cx}:${cy}`;
}
function neighborsForCellKey(key: string, radius = 1) {
  const [sx, sy] = key.split(":").map(Number);
  const arr: string[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      arr.push(`${sx + dx}:${sy + dy}`);
    }
  }
  return arr;
}
function toRad(d: number) { return d * Math.PI / 180; }
function haversine(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const A = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon/2)**2;
  const C = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
  return R * C;
}
function now() { return Date.now(); }

// Heartbeat: ping clients and remove stale
setInterval(() => {
  const t = now();
  for (const [id, c] of clients.entries()) {
    if (t - c.lastSeen > CLIENT_TIMEOUT_MS) {
      try { c.socket.close(); } catch {}
      clients.delete(id);
      console.log(`Removed stale client ${id}`);
      // clear outstanding timers
      for (const [, item] of c.outstanding) {
        if (item.timer) clearTimeout(item.timer);
      }
      continue;
    }
    // send ping
    try { c.socket.send(JSON.stringify({ type: "ping", ts: t })); } catch (_) {}
  }
}, HEARTBEAT_MS);

// send delivery message with retry logic
function sendToReceiver(receiver: Client, senderId: string, ytid: string) {
  const seq = seqCounter++;
  const payload = { type: "deliver", seq, from: senderId, Ytid: ytid, ts: now() };
  // store outstanding on receiver
  receiver.outstanding.set(seq, { senderId, ytid, tries: 0, timer: undefined });

  function attempt() {
    const entry = receiver.outstanding.get(seq);
    if (!entry) return;
    if (entry.tries >= MAX_RETRIES) {
      console.warn(`Max retries for seq ${seq} receiver ${receiver.id}`);
      receiver.outstanding.delete(seq);
      return;
    }
    entry.tries++;
    try {
      receiver.socket.send(JSON.stringify(payload));
    } catch (e) {
      console.warn("Send error", e);
    }
    // schedule next retry if no ack
    entry.timer = setTimeout(() => attempt(), RETRY_INTERVAL_MS);
  }
  attempt();
}

// When sender changes Ytid, find nearby receivers and deliver
function handleSenderNewYtid(sender: Client) {
  if (!sender.Ytid) return;
  sender.lastSeen = now();

  if (!sender.cellKey) return;
  // gather candidate receivers by checking neighboring cells
  const neighborCells = neighborsForCellKey(sender.cellKey, 1); // radius 1 cell (adjust)
  for (const c of clients.values()) {
    if (c.mode !== "receiver") continue;
    if (!c.cellKey) continue;
    if (!neighborCells.includes(c.cellKey)) continue;
    // exact distance check
    const d = haversine(sender.lat, sender.lon, c.lat, c.lon);
    if (d <= DISTANCE_THRESHOLD_M) {
      const last = c.lastReceivedFrom.get(sender.id);
      if (last === sender.Ytid) {
        // already delivered this Ytid from this sender to this receiver
        continue;
      }
      // send and wait for ack
      sendToReceiver(c, sender.id, sender.Ytid);
    }
  }
}

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
    cellKey: null,
    Ytid: undefined,
    lastSeen: now(),
    lastReceivedFrom: new Map(),
    outstanding: new Map(),
  };
  clients.set(id, client);
  console.log(`Client connected ${id}`);

  socket.onopen = () => {
    try { socket.send(JSON.stringify({ type: "connected", id })); } catch {}
  };

  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      client.lastSeen = now();

      if (msg.type === "register") {
        if (msg.mode === "sender" || msg.mode === "receiver") client.mode = msg.mode;
        if (typeof msg.deviceId === "string") {
          // allow client to pass desired id (optional)
          clients.delete(client.id);
          client.id = msg.deviceId;
          clients.set(client.id, client);
        }
        try { client.socket.send(JSON.stringify({ type: "registered", id: client.id })); } catch {}
        return;
      }

      if (msg.type === "update") {
        if (typeof msg.lat === "number" && typeof msg.lon === "number") {
          client.lat = msg.lat; client.lon = msg.lon;
          client.cellKey = cellKeyFor(client.lat, client.lon);
        }
        if (msg.mode === "sender" || msg.mode === "receiver") client.mode = msg.mode;
        if (typeof msg.Ytid === "string" && msg.mode === "sender") {
          const prev = client.Ytid;
          client.Ytid = msg.Ytid;
          // Only trigger delivery if Ytid changed
          if (client.Ytid && client.Ytid !== prev && client.mode === "sender") {
            handleSenderNewYtid(client);
          }
        }
        return;
      }

      if (msg.type === "ack") {
        // ack from receiver for a seq
        const seq = Number(msg.seq);
        if (Number.isFinite(seq)) {
          const out = client.outstanding.get(seq);
          if (out) {
            // this client acked delivery; mark the receiving client's lastReceivedFrom
            // Note: ack will be sent by receiver; we need to find the receiver client (this), and mark it
            // but for server we already stored outstanding on receiver; so simply remove
            client.outstanding.delete(seq);
            // record lastReceivedFrom mapping: senderId -> ytid (msg.from)
            if (typeof msg.from === "string" && typeof msg.Ytid === "string") {
              client.lastReceivedFrom.set(msg.from, msg.Ytid);
            }
          }
        }
        return;
      }

      if (msg.type === "pong") {
        // client heartbeat reply
        client.lastSeen = now();
        return;
      }
    } catch (err) {
      console.warn("ws parse error", err);
    }
  };

  socket.onclose = () => {
    // clear outstanding timers if any
    for (const [, item] of client.outstanding) {
      if (item.timer) clearTimeout(item.timer);
    }
    clients.delete(client.id);
    console.log(`Client disconnected ${client.id}`);
  };

  socket.onerror = (e) => {
    console.warn("socket error", e);
  };

  return response;
}

// Serve
serve((req) => {
  const url = new URL(req.url);
  if (url.pathname === "/ws" && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return handleWs(req);
  }
  if (url.pathname === "/check") {
    const snap = Array.from(clients.values()).map(c => ({
      id: c.id, mode: c.mode, lat: c.lat, lon: c.lon, cellKey: c.cellKey, Ytid: c.Ytid, lastSeen: c.lastSeen
    }));
    return new Response(JSON.stringify(snap, null, 2), {
      headers: { "content-type": "application/json" }
    });
  }
  return new Response("Realtime Geo WebSocket server", { headers: { "content-type": "text/plain" }});
}, { port: PORT });

console.log(`Server listening on :${PORT}`);
