// === vfy-call.deno.dev ===
// Instant WebSocket FM Server
// Run: deno run --allow-net main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  role: "broadcaster" | "listener";
  socket: WebSocket;
}

const clients: Client[] = [];
let lastSong: string | null = null; // base64 URL of current song

console.log("✅ vfy-call.deno.dev running (FM Sync Server)");

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("WebSocket only", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  let role: "broadcaster" | "listener" = "listener";

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "register") {
        role = msg.role;
        clients.push({ id, role, socket });
        console.log(`🟢 ${role} connected (${id})`);

        // send current song to new listener
        if (role === "listener" && lastSong) {
          socket.send(JSON.stringify({ type: "song", data: lastSong }));
        }
      }
      else if (msg.type === "song") {
        // broadcaster changed song
        lastSong = msg.data;
        for (const c of clients.filter(c => c.role === "listener")) {
          c.socket.send(JSON.stringify({ type: "song", data: lastSong }));
        }
        console.log("🎵 Broadcasting new song to all listeners");
      }
    } catch (_) {}
  };

  socket.onclose = () => {
    const i = clients.findIndex(c => c.id === id);
    if (i >= 0) clients.splice(i, 1);
    console.log(`🔴 ${role} left (${id})`);
  };

  return response;
});
