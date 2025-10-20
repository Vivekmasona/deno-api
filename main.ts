// server.ts
// Run with: deno run --allow-net --allow-read server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { contentType } from "https://deno.land/std@0.224.0/media_types/mod.ts";

type Room = { sockets: WebSocket[] };
const rooms = new Map<string, Room>();

const PORT = Number(Deno.env.get("PORT") || 8080);

console.log(`🚀 Signaling + Static server starting on :${PORT}`);

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // If WebSocket upgrade requested at /ws -> upgrade
    if (pathname === "/ws") {
      const { socket, response } = Deno.upgradeWebSocket(req);
      const params = url.searchParams;
      const roomId = params.get("room") || "default";

      socket.onopen = () => {
        console.log("WS open, room=", roomId);
        if (!rooms.has(roomId)) rooms.set(roomId, { sockets: [] });
        rooms.get(roomId)!.sockets.push(socket);
      };

      socket.onmessage = (ev) => {
        // Relay to other peers in the same room
        try {
          const room = rooms.get(roomId);
          if (!room) return;
          for (const s of room.sockets) {
            if (s !== socket && s.readyState === WebSocket.OPEN) {
              s.send(ev.data);
            }
          }
        } catch (err) {
          console.error("relay error:", err);
        }
      };

      socket.onclose = () => {
        console.log("WS close, room=", roomId);
        const room = rooms.get(roomId);
        if (!room) return;
        room.sockets = room.sockets.filter(s => s !== socket);
        if (room.sockets.length === 0) rooms.delete(roomId);
      };

      socket.onerror = (e) => console.error("WS error:", e);
      // Return the upgrade response (cannot attach CORS headers reliably here)
      return response;
    }

    // Serve static files from current directory (index.html, js, css)
    // Default to index.html for '/'
    let filePath = "." + pathname;
    if (pathname === "/") filePath = "./index.html";

    try {
      const data = await Deno.readFile(filePath);
      const ct = contentType(filePath) || "application/octet-stream";
      const headers = new Headers({
        "Content-Type": ct,
        "Access-Control-Allow-Origin": "*",
      });
      return new Response(data, { status: 200, headers });
    } catch (err) {
      // Not found
      return new Response("Not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  } catch (e) {
    console.error("server error", e);
    return new Response("Internal server error", { status: 500 });
  }
}, { addr: `:${PORT}` });
