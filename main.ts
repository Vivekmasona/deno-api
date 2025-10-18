// === Nearby YouTube Sync Server (Deno) ===
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
const RANGE = 50; // meters (pairing distance)

// --- Calculate distance between two lat/lon points ---
function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // radius of Earth in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Start WebSocket Server ---
serve(
  (req) => {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const client: Client = { id: crypto.randomUUID(), socket, mode: "receiver" };
    clients.push(client);

    socket.onopen = () => {
      console.log("🟢 Client connected:", client.id);
      socket.send(JSON.stringify({ type: "welcome", id: client.id }));
    };

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        // update location (optional)
        if (msg.type === "updateLocation") {
          client.lat = msg.lat;
          client.lon = msg.lon;
        }

        // toggle mode
        if (msg.type === "mode" && (msg.mode === "sender" || msg.mode === "receiver")) {
          client.mode = msg.mode;
          console.log(`🔁 ${client.id} switched to ${client.mode}`);
        }

        // sender clicked a song
        if (msg.type === "songClick" && msg.data) {
          console.log(`🎵 Sender ${client.id} clicked: ${msg.data.snippet?.title || msg.data.title}`);
          broadcastToNearby(client, msg.data);
        }
      } catch (err) {
        console.error("Parse error:", err);
      }
    };

    socket.onclose = () => {
      const i = clients.findIndex((c) => c.id === client.id);
      if (i >= 0) clients.splice(i, 1);
      console.log("🔴 Client left:", client.id);
    };

    return response;
  },
  {
    port: 8000,
    onListen: () => console.log("🚀 Server running on :8000"),
  }
);

// --- Send to all receivers nearby (<= RANGE) ---
function broadcastToNearby(sender: Client, songData: any) {
  if (!sender.lat || !sender.lon) {
    // agar location nahi di gayi, sabko bhej (for demo)
    console.log("⚠️ No sender location, broadcasting to all receivers");
    for (const rec of clients) {
      if (rec.id === sender.id || rec.mode !== "receiver") continue;
      sendSong(rec, sender, songData, 0);
    }
    return;
  }

  for (const rec of clients) {
    if (rec.id === sender.id || rec.mode !== "receiver" || !rec.lat || !rec.lon) continue;
    const d = calcDistance(sender.lat, sender.lon, rec.lat, rec.lon);
    if (d <= RANGE) sendSong(rec, sender, songData, Math.round(d));
  }
}

// --- Helper: Send one song to a receiver ---
function sendSong(rec: Client, sender: Client, songData: any, dist: number) {
  try {
    rec.socket.send(
      JSON.stringify({
        type: "addSong",
        data: songData,
        from: sender.id,
        dist,
      })
    );
    console.log(`📡 Sent "${songData.snippet?.title}" to ${rec.id} (${dist}m)`);
  } catch (err) {
    console.error("Send error:", err);
  }
}
