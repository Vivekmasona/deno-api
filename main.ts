import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

serve((req) => {
  const { pathname } = new URL(req.url);

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  // ✅ Check route
  if (pathname === "/check") {
    return new Response("Server running ✅", { headers });
  }

  // ✅ WebSocket
  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    setupSocket(socket);
    return response;
  }

  return new Response("404 Not Found", { status: 404, headers });
});

interface Device {
  id: string;
  lat?: number;
  lon?: number;
  mode?: "share" | "receive";
  socket: WebSocket;
}

const devices: Map<string, Device> = new Map();

function setupSocket(socket: WebSocket) {
  socket.onopen = () => console.log("🟢 Client connected");

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);

      if (msg.type === "register") {
        devices.set(msg.id, { id: msg.id, socket, mode: msg.mode });
        broadcastDeviceList();
      }

      if (msg.type === "mode") {
        const d = devices.get(msg.id);
        if (d) d.mode = msg.mode;
        broadcastDeviceList();
      }

      if (msg.type === "position") {
        const d = devices.get(msg.id);
        if (d) {
          d.lat = msg.lat;
          d.lon = msg.lon;
          d.mode = msg.mode;
        }
        broadcastDeviceList();
      }

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
}

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
