// main.ts
// deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Device {
  id: string;
  socket: WebSocket;
  mode?: "share" | "receive";
  lat?: number;
  lon?: number;
  Ytid?: string;
  lastSeen: number;
}

const devices = new Map<string, Device>();
const PAIR_COOLDOWN_MS = 25_000; // per-pair cooldown
const pairCooldown = new Map<string, number>();

function now() { return Date.now(); }

function metersBetween(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R = 6371000;
  const toRad = (d:number) => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function handleWebSocket(req: Request) {
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    console.log("WS: client connected");
  };

  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      const ts = now();

      // register or keep device record
      if (msg.type === "register") {
        const id = String(msg.id || crypto.randomUUID());
        devices.set(id, {
          id,
          socket,
          mode: msg.mode === "share" ? "share" : "receive",
          lat: typeof msg.lat === "number" ? msg.lat : undefined,
          lon: typeof msg.lon === "number" ? msg.lon : undefined,
          Ytid: typeof msg.Ytid === "string" ? msg.Ytid : undefined,
          lastSeen: ts
        });
        // ack
        try { socket.send(JSON.stringify({ type: "registered", id })); } catch {}
        console.log(`registered ${id}`);
        return;
      }

      // update device info (position/mode/ytid)
      if (msg.type === "update") {
        const id = String(msg.id);
        let d = devices.get(id);
        if (!d) {
          d = { id, socket, lastSeen: ts };
          devices.set(id, d);
        }
        d.mode = msg.mode === "share" ? "share" : (msg.mode === "receive" ? "receive" : d.mode);
        if (typeof msg.lat === "number") d.lat = msg.lat;
        if (typeof msg.lon === "number") d.lon = msg.lon;
        if (typeof msg.Ytid === "string") d.Ytid = msg.Ytid;
        d.lastSeen = ts;

        // After updating, check proximity: for this updated device, check others
        // If this device is SHARE, forward to nearby RECEIVERS
        // If this device is RECEIVE, check for nearby SHARE devices and forward that share to this receiver
        try {
          // iterate other devices
          for (const [otherId, other] of devices.entries()) {
            if (otherId === id) continue;
            if (!other.lat || !other.lon || !d.lat || !d.lon) continue;

            const dist = metersBetween(d.lat!, d.lon!, other.lat!, other.lon!);
            if (dist <= 100) {
              const key = [id, otherId].sort().join("|");
              const last = pairCooldown.get(key) ?? 0;
              if (ts - last < PAIR_COOLDOWN_MS) continue; // skip if within cooldown

              // Determine direction: if one is share and the other is receive
              // If d.mode==='share' and other.mode==='receive' -> forward d.Ytid to other
              // Else if other.mode==='share' and d.mode==='receive' -> forward other.Ytid to d
              if (d.mode === "share" && other.mode === "receive" && d.Ytid) {
                // forward d.Ytid to other
                try { other.socket.send(JSON.stringify({ type: "play", from: id, Ytid: d.Ytid })); } catch {}
                try { socket.send(JSON.stringify({ type: "forwarded", to: otherId, Ytid: d.Ytid })); } catch {}
                pairCooldown.set(key, ts);
                console.log(`forwarded ${d.Ytid} from ${id} -> ${otherId} (${Math.round(dist)}m)`);
              } else if (other.mode === "share" && d.mode === "receive" && other.Ytid) {
                // forward other.Ytid to d
                try { d.socket.send(JSON.stringify({ type: "play", from: otherId, Ytid: other.Ytid })); } catch {}
                try { other.socket.send(JSON.stringify({ type: "forwarded", to: id, Ytid: other.Ytid })); } catch {}
                pairCooldown.set(key, ts);
                console.log(`forwarded ${other.Ytid} from ${otherId} -> ${id} (${Math.round(dist)}m)`);
              }
            }
          }
        } catch (e) {
          console.error("Proximity forward error:", e);
        }

        return;
      }

      // explicit announce: (optional) client asks server to attempt forward now
      if (msg.type === "announce") {
        const id = String(msg.id);
        const d = devices.get(id);
        if (!d) return;
        // update info
        if (typeof msg.Ytid === "string") d.Ytid = msg.Ytid;
        if (typeof msg.lat === "number") d.lat = msg.lat;
        if (typeof msg.lon === "number") d.lon = msg.lon;
        d.lastSeen = ts;
        // reuse same logic as update: just trigger the update branch by calling same code:
        // we'll simply reuse update logic by creating msg-like object and processing above:
        // (easy way) call devices.set? But we'll just re-run the update block by sending a synthetic update:
        // Here, replicate update-forward code:
        for (const [otherId, other] of devices.entries()) {
          if (otherId === id) continue;
          if (!other.lat || !other.lon || !d.lat || !d.lon) continue;
          const dist = metersBetween(d.lat!, d.lon!, other.lat!, other.lon!);
          if (dist <= 100) {
            const key = [id, otherId].sort().join("|");
            const last = pairCooldown.get(key) ?? 0;
            if (ts - last < PAIR_COOLDOWN_MS) continue;
            if (d.mode === "share" && other.mode === "receive" && d.Ytid) {
              try { other.socket.send(JSON.stringify({ type: "play", from: id, Ytid: d.Ytid })); } catch {}
              try { socket.send(JSON.stringify({ type: "forwarded", to: otherId, Ytid: d.Ytid })); } catch {}
              pairCooldown.set(key, ts);
              console.log(`(announce) forwarded ${d.Ytid} from ${id} -> ${otherId}`);
            } else if (other.mode === "share" && d.mode === "receive" && other.Ytid) {
              try { d.socket.send(JSON.stringify({ type: "play", from: otherId, Ytid: other.Ytid })); } catch {}
              try { other.socket.send(JSON.stringify({ type: "forwarded", to: id, Ytid: other.Ytid })); } catch {}
              pairCooldown.set(key, ts);
              console.log(`(announce) forwarded ${other.Ytid} from ${otherId} -> ${id}`);
            }
          }
        }
        return;
      }

    } catch (err) {
      console.error("WS msg parse error", err);
    }
  };

  socket.onclose = () => {
    // remove device(s) using this socket
    for (const [id, d] of devices.entries()) {
      if (d.socket === socket) devices.delete(id);
    }
    console.log("WS: client disconnected");
  };

  socket.onerror = (e) => {
    console.error("WS error", e);
  };

  return response;
}

serve((req) => {
  const url = new URL(req.url);
  if (url.pathname === "/ws" && req.headers.get("upgrade") === "websocket") {
    return handleWebSocket(req);
  }
  if (url.pathname === "/check") {
    return new Response("OK", { status: 200 });
  }
  return new Response("Proximity WS running", { status: 200 });
}, { port: 8000 });

console.log("Server running on ws://localhost:8000/ws (use wss in production)");
