// === Nearby YouTube Sync Server (Deno) ===
// Run: deno run --allow-net main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  socket: WebSocket;
  lat?: number;
  lon?: number;
  lastYtid?: string;
}

const clients: Client[] = [];
const RANGE = 50; // meters (pair distance)

function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Handle socket upgrade ---
serve((req) => {
  const { socket, response } = Deno.upgradeWebSocket(req);
  const client: Client = { id: crypto.randomUUID(), socket };
  clients.push(client);

  socket.onopen = () => {
    console.log("Client connected:", client.id);
    socket.send(JSON.stringify({ type: "welcome", id: client.id }));
  };

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "updateLocation") {
        client.lat = msg.lat;
        client.lon = msg.lon;
      }

      // When sender sends video id
      if (msg.type === "sender" && msg.Ytid) {
        client.lastYtid = msg.Ytid;
        console.log(`🎵 Sender ${client.id}: ${msg.Ytid}`);
        checkNearby(client);
      }
    } catch (err) {
      console.error("Parse error:", err);
    }
  };

  socket.onclose = () => {
    const i = clients.findIndex((c) => c.id === client.id);
    if (i >= 0) clients.splice(i, 1);
    console.log("Client left:", client.id);
  };

  return response;
}, {
  port: 8000,
  onListen: () => console.log("🚀 Server running on :8000"),
  handler: (_req) => new Response("OK", {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  }),
});

function checkNearby(sender: Client) {
  if (!sender.lat || !sender.lon) return;
  for (const rec of clients) {
    if (rec.id === sender.id || !rec.lat || !rec.lon) continue;
    const d = calcDistance(sender.lat, sender.lon, rec.lat, rec.lon);
    if (d <= RANGE) {
      try {
        rec.socket.send(JSON.stringify({ type: "update", id: sender.lastYtid }));
        sender.socket.send(JSON.stringify({
          type: "paired",
          from: sender.id,
          to: rec.id,
          dist: Math.round(d),
        }));
        rec.socket.send(JSON.stringify({
          type: "paired",
          from: sender.id,
          to: rec.id,
          dist: Math.round(d),
        }));
        console.log(`🔗 Paired ${sender.id} ↔ ${rec.id} @ ${Math.round(d)}m`);
      } catch (err) {
        console.error("Send error:", err);
      }
    }
  }
}
