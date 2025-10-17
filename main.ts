// main.ts
// Run: deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";

interface Client {
  id: string;
  lat: number;
  lon: number;
  ws: WebSocket;
}

const clients = new Map<string, Client>();
let lastYtid = ""; // latest YouTube ID

// Helper: distance in meters
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

function handleWebSocket(req: Request) {
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
          console.log("🎵 Received new YouTube ID:", lastYtid);
        }

        // Check nearby clients (100 meters)
        for (const [otherId, c] of clients.entries()) {
          if (otherId === data.id) continue;
          const d = distance(data.lat, data.lon, c.lat, c.lon);
          if (d <= 100 && lastYtid) {
            try {
              c.ws.send(JSON.stringify({ type: "play", Ytid: lastYtid }));
            } catch {}
            try {
              socket.send(JSON.stringify({ type: "play", Ytid: lastYtid }));
            } catch {}
            console.log(
              `📡 ${data.id} ↔ ${otherId} within ${Math.round(
                d
              )}m — sharing ${lastYtid}`
            );
          }
        }
      }
    } catch (err) {
      console.error("❌ Invalid WS message:", err);
    }
  };

  socket.onclose = () => {
    for (const [id, c] of clients.entries()) {
      if (c.ws === socket) clients.delete(id);
    }
  };

  return response;
}

serve((req) => {
  const url = new URL(req.url);

  // 🟢 1. WebSocket endpoint
  if (url.pathname === "/ws" && req.headers.get("upgrade") === "websocket") {
    return handleWebSocket(req);
  }

  // 🟢 2. Check endpoint — show current YouTube ID
  if (url.pathname === "/check") {
    return new Response(
      lastYtid
        ? `🎶 Current YouTube ID: ${lastYtid}`
        : "⚠️ No YouTube ID uploaded yet.",
      { headers: { "content-type": "text/plain" } }
    );
  }

  // 🟢 3. Default response
  return new Response(
    "🎧 VFY proximity share server is running.\nUse /ws for WebSocket or /check to see latest YT ID.",
    { headers: { "content-type": "text/plain" } }
  );
}, { port: 8000 });

console.log("🟢 Server running at:");
console.log("   → ws://localhost:8000/ws");
console.log("   → http://localhost:8000/check");
