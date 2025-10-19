// === Global FM Server v2.1 (CORS + Binary Sync) ===
// Run: deno run --allow-net main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const clients = new Set<WebSocket>();

function sendAll(data: string | ArrayBuffer, except?: WebSocket) {
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN && c !== except) {
      c.send(data);
    }
  }
}

serve((req) => {
  // ✅ Handle CORS preflight
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

  // ✅ Normal HTTP request (not WebSocket)
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("🎧 Global FM v2.1 running", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/plain",
      },
    });
  }

  // ✅ WebSocket connection
  const { socket, response } = Deno.upgradeWebSocket(req);
  clients.add(socket);

  socket.onopen = () => {
    console.log("Client connected:", clients.size);
  };

  socket.onmessage = (e) => {
    // Forward same message (song meta + chunks)
    sendAll(e.data, socket);
  };

  socket.onclose = () => {
    clients.delete(socket);
