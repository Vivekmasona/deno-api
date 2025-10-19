// === Shared Audio Sync Server (Session Based) ===
// Deploy on Deno Deploy

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  socket: WebSocket;
  session?: string;
}

const clients = new Map<string, Client>();

serve((req) => {
  const { pathname } = new URL(req.url);

  // ✅ API Health check
  if (pathname === "/" || pathname === "/status") {
    return new Response(
      JSON.stringify({
        status: "running ✅",
        sessions: Array.from(new Set([...clients.values()].map(c => c.session).filter(Boolean))),
        total_clients: clients.size,
        time: new Date().toISOString(),
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  // 🔗 WebSocket
  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const id = crypto.randomUUID();

    socket.onopen = () => {
      clients.set(id, { id, socket });
      socket.send(JSON.stringify({ type: "id", id }));
      console.log("Client connected:", id);
    };

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        // Session join
        if (data.type === "join" && data.session) {
          const client = clients.get(id);
          if (client) client.session = data.session;
          console.log(`Client ${id} joined session ${data.session}`);
          return;
        }

        // Broadcast within same session
        const client = clients.get(id);
        if (client?.session) {
          for (const c of clients.values()) {
            if (c.session === client.session && c.id !== id) {
              c.socket.send(JSON.stringify(data));
            }
          }
        }
      } catch (err) {
        console.error("Error:", err);
      }
    };

    socket.onclose = () => {
      clients.delete(id);
      console.log("Client disconnected:", id);
    };

    return response;
  }

  return new Response("Not Found", { status: 404 });
});
