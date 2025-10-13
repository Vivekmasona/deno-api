// server.ts
// Deno version of your server.js (Express + Socket.io equivalent)

// ================== IMPORTS ==================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { corsHeaders } from "https://deno.land/x/cors_headers@v1.0.0/mod.ts";
import { Server } from "https://esm.sh/socket.io@4.7.5";
import { createServer } from "https://deno.land/std@0.224.0/http/server.ts";

// ================== HTTP + SOCKET.IO ==================
const httpServer = createServer({ port: 3000 });
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

console.log("✅ Deno Socket.io Server started on :3000");

// ================== SOCKET.IO PART ==================
const activeUsers = new Map<string, string>();

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join-room", (roomID: string) => {
    socket.join(roomID);
    activeUsers.set(socket.id, roomID);
    console.log(`User ${socket.id} joined room: ${roomID}`);
  });

  socket.on("call-request", ({ roomID }) => {
    console.log(`Call request from ${socket.id} to room ${roomID}`);
    socket.to(roomID).emit("incoming-call", { from: socket.id });
  });

  socket.on("call-accepted", ({ to }) => {
    console.log(`Call accepted by ${socket.id}`);
    io.to(to).emit("call-accepted");
  });

  socket.on("call-rejected", ({ to }) => {
    console.log(`Call rejected by ${socket.id}`);
    io.to(to).emit("call-rejected");
  });

  socket.on("offer", ({ offer, roomID }) => {
    console.log(`Offer sent to room: ${roomID}`);
    socket.to(roomID).emit("offer", { offer });
  });

  socket.on("answer", ({ answer, roomID }) => {
    console.log(`Answer sent to room: ${roomID}`);
    socket.to(roomID).emit("answer", { answer });
  });

  socket.on("candidate", ({ candidate, roomID }) => {
    socket.to(roomID).emit("candidate", { candidate });
  });

  socket.on("end-call", (roomID: string) => {
    console.log(`Call ended in room: ${roomID}`);
    socket.to(roomID).emit("call-ended");
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    const roomID = activeUsers.get(socket.id);
    if (roomID) {
      socket.to(roomID).emit("call-ended");
      activeUsers.delete(socket.id);
    }
  });
});

// ================== REST API ==================
const sessions = new Map<string, Map<string, number>>();

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS headers (for frontend)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...corsHeaders,
      },
    });
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

    // Remove inactive devices (>15s)
    for (const [d, last] of devices.entries()) {
      if (now - last > 15000) {
        devices.delete(d);
      }
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

  // Default serve
  return serveDir(req, {
    fsRoot: ".",
  });
}

// ================== START SERVER ==================
serve(handler, { port: 8080 });
console.log("🌐 HTTP server running at http://localhost:8080");
