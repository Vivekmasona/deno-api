// === Deno Audio Sync Relay Server (with API health check) ===
// Works on Deno Deploy

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  socket: WebSocket;
}

const clients = new Map<string, Client>();

serve((req) => {
  const { pathname } = new URL(req.url);

  // --- ✅ API Health Check ---
  if (pathname === "/" || pathname === "/status") {
    return new Response(
      JSON.stringify({
        status: "running ✅",
        clients: clients.size,
        uptime: new Date().toISOString(),
      }),
      {
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }

  // --- 🔗 WebSocket Upgrade ---
  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const id = crypto.randomUUID();

    socket.onopen = () => {
      clients.set(id, { id, socket });
      console.log("Client connected:", id);
      socket.send(JSON.stringify({ type: "id", id }));
    };

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.to && clients.has(data.to)) {
          clients.get(data.to)!.socket.send(JSON.stringify(data));
        }
      } catch (err) {
        console.error("Invalid message:", err);
      }
    };

    socket.onclose = () => {
      clients.delete(id);
      console.log("Client disconnected:", id);
    };

    return response;
  }

  // --- ❌ Fallback for invalid paths ---
  return new Response("Not Found", { status: 404 });
});
