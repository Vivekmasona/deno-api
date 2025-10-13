// server.ts
// Deno version of Express + Socket.io combined single-port server

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Server } from "https://esm.sh/socket.io@4.7.5";
import { instrument } from "https://esm.sh/@socket.io/admin-ui@0.1.0";

// ================== CORS HEADERS ==================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ================== SOCKET.IO SERVER ==================
const io = new Server({
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

instrument(io, { auth: false });

// Active users map
const activeUsers = new Map<string, string>();

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("join-room", (roomID: string) => {
    socket.join(roomID);
    activeUsers.set(socket.id, roomID);
    console.log(`User ${socket.id} joined room: ${roomID}`);
  });

  socket.on("call-request", ({ roomID }) => {
    socket.to(roomID).emit("incoming-call", { from: socket.id });
  });

  socket.on("call-accepted", ({ to }) => {
    io.to(to).emit("call-accepted");
  });

  socket.on("call-rejected", ({ to }) => {
    io.to(to).emit("call-rejected");
  });

  socket.on("offer", ({ offer, roomID }) => {
    socket.to(roomID).emit("offer", { offer });
  });

  socket.on("answer", ({ answer, roomID }) => {
    socket.to(roomID).emit("answer", { answer });
  });

  socket.on("candidate", ({ candidate, roomID }) => {
    socket.to(roomID).emit("candidate", { candidate });
  });

  socket.on("end-call", (roomID: string) => {
    socket.to(roomID).emit("call-ended");
  });

  socket.on("disconnect", () => {
    const roomID = activeUsers.get(socket.id);
    if (roomID) {
      socket.to(roomID).emit("call-ended");
      activeUsers.delete(socket.id);
    }
  });
});

// ================== REST SESSION API ==================
const sessions = new Map<string, Map<string, number>>();

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (path === "/ping") {
    const sessionId = url.searchParams.get("sessionId");
    const deviceId = url.searchParams.get("deviceId");

    if (!sessionId || !deviceId) {
      return Response.json({ ok: false }, { headers: corsHeaders });
    }

    const now = Date.now();
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, new Map());
    }

    const devices = sessions.get(sessionId)!;
    devices.set(deviceId, now);

    for (const [d, last] of devices.entries()) {
      if (now - last > 15000) devices.delete(d);
    }

    const onlineCount = devices.size;
    return Response.json({ ok: true, onlineCount }, { headers: corsHeaders });
  }

  if (path === "/status") {
    const output: Record<string, string[]> = {};
    for (const [sid, devices] of sessions.entries()) {
      output[sid] = Array.from(devices.keys());
    }
    return Response.json(output, { headers: corsHeaders });
  }

  return new Response("Deno + Socket.io server running", {
    headers: corsHeaders,
  });
}

// ================== START SERVER ==================
console.log("🚀 Server running on :8080");

serve((req) => {
  // Integrate socket.io with Deno serve
  return io.handler(req, handler);
}, { port: 8080 });
