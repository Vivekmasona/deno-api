// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface RoomMap {
  [key: string]: WebSocket[];
}

const rooms: RoomMap = {};

console.log("🚀 P2P Signaling Server running...");

serve((req) => {
  const { searchParams } = new URL(req.url);
  const room = searchParams.get("room");
  const upgrade = req.headers.get("upgrade") || "";

  // ✅ Handle CORS preflight (important for browser)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  // ✅ Normal HTTP request response (for testing)
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("✅ WebRTC Signaling Server Active", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/plain",
      },
    });
  }

  // ✅ WebSocket upgrade
  const { socket, response } = Deno.upgradeWebSocket(req, {
    protocol: "json",
  });

  socket.onopen = () => {
    console.log("🔗 Client connected", room);
    if (!room) return;
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push(socket);
  };

  socket.onmessage = (event) => {
    if (!room) return;
    try {
      const peers = rooms[room] || [];
      for (const peer of peers) {
        if (peer !== socket && peer.readyState === WebSocket.OPEN) {
          peer.send(event.data);
        }
      }
    } catch (err) {
      console.error("Message error:", err);
    }
  };

  socket.onclose = () => {
    if (room && rooms[room]) {
      rooms[room] = rooms[room].filter((s) => s !== socket);
      if (rooms[room].length === 0) delete rooms[room];
    }
    console.log("❌ Client disconnected", room);
  };

  socket.onerror = (err) => console.error("⚠️ WS Error:", err);

  return response;
});
