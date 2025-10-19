// === GLOBAL FM v3.0 — Live Broadcast Server ===
// Run: deno run --allow-net main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const clients = new Set<WebSocket>();

function sendAll(msg: string | ArrayBuffer, except?: WebSocket) {
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN && c !== except) c.send(msg);
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

  // ✅ Normal HTTP request
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("🎧 Global FM v3.0 is LIVE", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/plain",
      },
    });
  }

  // ✅ WebSocket upgrade
  const { socket, response } = Deno.upgradeWebSocket(req);
  clients.add(socket);

  socket.onmessage = (e) => sendAll(e.data, socket);
  socket.onclose = () => clients.delete(socket);
  socket.onerror = () => clients.delete(socket);

  return response;
});
