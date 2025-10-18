// === Nearby YouTube Sync Server (Deno) ===
// Run: deno run --allow-net main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  socket: WebSocket;
  lat?: number;
  lon?: number;
  lastYtid?: string;
  mode?: "sender" | "receiver";
}

const clients: Client[] = [];
const RANGE = 50; // meters (pair distance)

// --- Distance helper ---
function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Main Server ---
serve((req) => {
  // Handle OPTIONS preflight for CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const { socket, response } = Deno.upgradeWebSocket(req, {
    headers: corsHeaders(),
  });
  const client: Client = { id: crypto.randomUUID(), socket, mode: "receiver" };
  clients.push(client);

  socket.onopen = () => {
    console.log("🟢 Client connected:", client.id);
    socket.send(JSON.stringify({ type: "welcome", id: client.id }));
  };

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);

      // Mode toggle
      if (msg.type === "mode") {
        client.mode = msg.mode === "sender" ? "sender" : "receiver";
        console.log(`🔁 ${client.id} set to ${client.mode}`);
      }

      // Location update
      if (msg.type === "updateLocation") {
        client.lat = msg.lat;
        client.lon = msg.lon;
      }

      // Sender clicked a song (full info)
      if (msg.type === "songClick" && msg.data) {
        client.lastYtid = msg.data.id;
        console.log(`🎵 Sender ${client.id}: ${msg.data.snippet?.title}`);
        sendSongToNearbyReceivers(client, msg.data);
      }
    } catch (err) {
      console.error("⚠️ Parse error:", err);
    }
  };

  socket.onclose = () => {
    const i = clients.findIndex((c) => c.id === client.id);
    if (i >= 0) clients.splice(i, 1);
    console.log("🔴 Client left:", client.id);
  };

  return response;
}, {
  port: 8000,
  onListen: () => console.log("🚀 Server running on :8000"),
  handler: (_req) =>
    new Response("OK", {
      headers: corsHeaders(),
    }),
});

// --- Send to Nearby Receivers ---
function sendSongToNearbyReceivers(sender: Client, songData: any) {
  if (!sender.lat || !sender.lon) return;
  for (const rec of clients) {
    if (rec.id === sender.id || rec.mode === "sender") continue;
    if (!rec.lat || !rec.lon) continue;

    const d = calcDistance(sender.lat, sender.lon, rec.lat, rec.lon);
    if (d <= RANGE) {
      try {
        // Send full song info to receiver
        rec.socket.send(
          JSON.stringify({ type: "addSong", data: songData }),
        );

        // Feedback both sides
        sender.socket.send(
          JSON.stringify({
            type: "paired",
            from: sender.id,
            to: rec.id,
            dist: Math.round(d),
          }),
        );
        rec.socket.send(
          JSON.stringify({
            type: "paired",
            from: sender.id,
            to: rec.id,
            dist: Math.round(d),
          }),
        );
        console.log(`🔗 Paired ${sender.id} ↔ ${rec.id} @ ${Math.round(d)}m`);
      } catch (err) {
        console.error("Send error:", err);
      }
    }
  }
}

// --- CORS Headers ---
function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
