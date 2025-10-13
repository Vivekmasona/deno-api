// server.ts
// 100% Deno Deploy compatible WebRTC signaling server (no esm.sh)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Room management
const rooms = new Map<string, Set<WebSocket>>();

// Session heartbeat map
const sessions = new Map<string, Map<string, number>>();

// ========== Main HTTP Handler ==========
serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  // --- CORS preflight ---
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- WebSocket endpoint ---
  if (pathname === "/ws") {
    const { response, socket } = Deno.upgradeWebSocket(req);
    socket.onopen = () => console.log("✅ WebSocket connected");

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        handleSocketMessage(socket, data);
      } catch {
        console.error("Invalid WS message");
      }
    };

    socket.onclose = () => handleDisconnect(socket);
    return response;
  }

  // --- REST: /ping ---
  if (pathname === "/ping") {
    const sessionId = searchParams.get("sessionId");
    const deviceId = searchParams.get("deviceId");
    if (!sessionId || !deviceId) {
      return Response.json({ ok: false }, { headers: corsHeaders });
    }

    const now = Date.now();
    if (!sessions.has(sessionId)) sessions.set(sessionId, new Map());
    const devices = sessions.get(sessionId)!;
    devices.set(deviceId, now);

    for (const [d, last] of devices.entries()) {
      if (now - last > 15000) devices.delete(d);
    }

    return Response.json(
      { ok: true, onlineCount: devices.size },
      { headers: corsHeaders }
    );
  }

  // --- REST: /status ---
  if (pathname === "/status") {
    const out: Record<string, string[]> = {};
    for (const [sid, devices] of sessions.entries()) {
      out[sid] = Array.from(devices.keys());
    }
    return Response.json(out, { headers: corsHeaders });
  }

  // --- Default ---
  return new Response("🌐 Deno WebRTC signaling server online", {
    headers: corsHeaders,
  });
});

// ========== WebSocket Logic ==========
function handleSocketMessage(socket: WebSocket, data: any) {
  const { type, roomID, payload } = data;

  switch (type) {
    case "join-room":
      if (!rooms.has(roomID)) rooms.set(roomID, new Set());
      rooms.get(roomID)!.add(socket);
      console.log(`User joined room: ${roomID}`);
      break;

    case "offer":
    case "answer":
    case "candidate":
    case "call-request":
    case "call-accepted":
    case "call-rejected":
    case "end-call":
      broadcast(roomID, data, socket);
      break;
  }
}

function handleDisconnect(socket: WebSocket) {
  for (const [roomID, clients] of rooms.entries()) {
    if (clients.has(socket)) {
      clients.delete(socket);
      broadcast(roomID, { type: "end-call" }, socket);
    }
  }
}

function broadcast(roomID: string, message: any, sender?: WebSocket) {
  const clients = rooms.get(roomID);
  if (!clients) return;
  for (const client of clients) {
    if (client !== sender) client.send(JSON.stringify(message));
  }
}
