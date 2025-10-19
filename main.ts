// === Deno Audio Sync Relay Server ===
// Deploy on Deno Deploy

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  socket: WebSocket;
}

const clients = new Map<string, Client>();

serve((req) => {
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
      console.error("Bad message:", err);
    }
  };

  socket.onclose = () => clients.delete(id);

  return response;
});
