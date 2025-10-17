// main.ts
// Run: deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";

let lastYtid = "";
let lastUpdate = Date.now();

interface Client {
  id: string;
  lat: number;
  lon: number;
  ws: WebSocket;
}

const clients = new Map<string, Client>();

function distance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function handleWS(req: Request) {
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "update") {
        clients.set(data.id, {
          id: data.id,
          lat: data.lat,
          lon: data.lon,
          ws: socket,
        });

        if (data.Ytid) {
          lastYtid = data.Ytid;
          lastUpdate = Date.now();
          console.log("🎵 Received via WS:", lastYtid);
        }

        // distance check
        for (const [otherId, c] of clients.entries()) {
          if (otherId === data.id) continue;
          const d = distance(data.lat, data.lon, c.lat, c.lon);
          if (d <= 100 && lastYtid) {
            try {
              c.ws.send(JSON.stringify({ type: "play", Ytid: lastYtid }));
              socket.send(JSON.stringify({ type: "play", Ytid: lastYtid }));
            } catch {}
            console.log(`📡 Shared ${lastYtid} within ${Math.round(d)}m`);
          }
        }
      }
    } catch (err) {
      console.error("❌ Invalid WS msg:", err);
    }
  };

  socket.onclose = () => {
    for (const [id, c] of clients.entries()) if (c.ws === socket) clients.delete(id);
  };

  return response;
}

serve(async (req) => {
  const url = new URL(req.url);

  // 🟢 1. WebSocket
  if (url.pathname === "/ws" && req.headers.get("upgrade") === "websocket") {
    return handleWS(req);
  }

  // 🟢 2. Upload via REST API
  if (url.pathname === "/upload" && req.method === "POST") {
    try {
      const body = await req.json();
      if (body.Ytid) {
        lastYtid = body.Ytid;
        lastUpdate = Date.now();
        console.log("📥 Received via HTTP:", lastYtid);
        return new Response(JSON.stringify({ success: true, Ytid: lastYtid }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: false, error: "Missing Ytid" }), {
        headers: { "content-type": "application/json" },
      });
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
  }

  // 🟢 3. Check endpoint
  if (url.pathname === "/check") {
    return new Response(
      lastYtid
        ? `🎶 Current Ytid: ${lastYtid}\n🕒 Updated: ${new Date(lastUpdate).toLocaleString()}`
        : "⚠️ No Ytid uploaded yet.",
      { headers: { "content-type": "text/plain" } }
    );
  }

  // 🟢 Default response
  return new Response(
    "🎧 VFY server running.\n/ws for WebSocket\n/upload for POST\n/check for latest ID",
    { headers: { "content-type": "text/plain" } }
  );
}, { port: 8000 });

console.log("🟢 Server running:\n  ws://localhost:8000/ws\n  POST /upload\n  GET /check");
