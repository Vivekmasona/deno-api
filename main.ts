// === Nearby Sync Server (Deno) ===
// Run: deno run --allow-net main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  socket: WebSocket;
  lat?: number;
  lon?: number;
  mode: "sender" | "receiver";
}

const clients: Client[] = [];
const RANGE = 50; // meters

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

// 🛰️ MAIN SERVER
serve(async (req) => {
  const { pathname } = new URL(req.url);

  // ✅ Allow browser preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // ✅ WebSocket Upgrade route
  if (pathname === "/") {
    const upgrade = Deno.upgradeWebSocket(req, {
      headers: corsHeaders(),
    });
    const socket = upgrade.socket;

    const client: Client = {
      id: crypto.randomUUID(),
      socket,
      mode: "receiver",
    };
    clients.push(client);
    console.log("🟢 Connected:", client.id);

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "welcome", id: client.id }));
    };

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === "mode") {
          client.mode = msg.mode === "sender" ? "sender" : "receiver";
          console.log(`🔁 ${client.id} is now ${client.mode}`);
        }

        if (msg.type === "updateLocation") {
          client.lat = msg.lat;
          client.lon = msg.lon;
        }

        if (msg.type === "songClick") {
          console.log(`🎵 Sender ${client.id} clicked: ${msg.data.snippet?.title}`);
          broadcastToNearby(client, msg.data);
        }
      } catch (err) {
        console.error("⚠️ Message parse error:", err);
      }
    };

    socket.onclose = () => {
      const i = clients.findIndex((c) => c.id === client.id);
      if (i >= 0) clients.splice(i, 1);
      console.log("🔴 Disconnected:", client.id);
    };

    return upgrade.response;
  }

  // ✅ Fallback for browser test
  return new Response(
    "Nearby Sync WebSocket Server Active ✅",
    { headers: corsHeaders() }
  );
}, { port: 8000 });

// 🧠 Helper — broadcast song info to nearby receivers
function broadcastToNearby(sender: Client, songData: any) {
  for (const rec of clients) {
    if (rec.id === sender.id || rec.mode !== "receiver") continue;

    if (sender.lat && sender.lon && rec.lat && rec.lon) {
      const dist = calcDistance(sender.lat, sender.lon, rec.lat, rec.lon);
      if (dist > RANGE) continue;
    }

    rec.socket.send(JSON.stringify({ type: "addSong", data: songData }));
    console.log(`📡 Sent "${songData.snippet?.title}" → ${rec.id}`);
  }
}

// ✅ Proper CORS headers (for frontend connection)
function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*", // allow all
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}
