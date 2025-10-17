// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Device {
  id: string;
  lat?: number;
  lon?: number;
  mode?: "share" | "receive";
  socket: WebSocket;
}

const devices: Map<string, Device> = new Map();

// 🧭 Distance calculation
function distance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 🔌 Handle WebSocket connections
serve((req) => {
  const { pathname } = new URL(req.url);

  // 🧠 Test route
  if (pathname === "/check") {
    return new Response("✅ Server running fine");
  }

  // 🔄 WebSocket endpoint
  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => console.log("🟢 Client connected");

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        // Register device
        if (msg.type === "register") {
          devices.set(msg.id, { id: msg.id, socket, mode: msg.mode });
          broadcastDeviceList();
        }

        // Update mode
        if (msg.type === "mode") {
          const d = devices.get(msg.id);
          if (d) d.mode = msg.mode;
          broadcastDeviceList();
        }

        // Update geolocation
        if (msg.type === "position") {
          const d = devices.get(msg.id);
          if (d) {
            d.lat = msg.lat;
            d.lon = msg.lon;
            d.mode = msg.mode;
          }
          broadcastDeviceList();
        }

        // Play/share ID
        if (msg.type === "play") {
          const to = devices.get(msg.to);
          if (to) {
            to.socket.send(JSON.stringify({ type: "play", Ytid: msg.Ytid }));
          }
        }
      } catch (err) {
        console.error("Parse error:", err);
      }
    };

    socket.onclose = () => {
      for (const [id, d] of devices.entries()) {
        if (d.socket === socket) devices.delete(id);
      }
      broadcastDeviceList();
    };

    return response;
  }

  return new Response("404 Not Found", { status: 404 });
});

// 📡 Broadcast all connected devices (lightweight)
function broadcastDeviceList() {
  const list = Array.from(devices.values()).map(d => ({
    id: d.id, lat: d.lat, lon: d.lon, mode: d.mode,
  }));

  for (const d of devices.values()) {
    try {
      d.socket.send(JSON.stringify({ type: "devices", devices: list }));
    } catch {
      devices.delete(d.id);
    }
  }
}
