// server.ts
// Run: deno run --allow-net --allow-read server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { contentType } from "https://deno.land/std@0.224.0/media_types/mod.ts";

type Client = { id: string; ws: WebSocket; room?: string };
const rooms = new Map<string, Set<Client>>();

const ALLOWED_ORIGINS = ["*"]; // change to specific origin(s) if you want to restrict

console.log("🚀 Signaling + Static server starting on :8080");

serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // CORS helper
  const corsHeaders = (extra: Record<string,string> = {}) => {
    const origin = req.headers.get("origin") || "*";
    const allowOrigin = ALLOWED_ORIGINS.includes("*") ? "*" :
      (ALLOWED_ORIGINS.includes(origin) ? origin : "null");
    return {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      ...extra
    };
  };

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Serve static files from current directory (index.html, bundle.js etc.)
  // If not found, fall through to 404
  if (req.method === "GET" && (pathname === "/" || pathname.endsWith(".html") || pathname.endsWith(".js") || pathname.endsWith(".css") || pathname.endsWith(".png") || pathname.endsWith(".webmanifest"))) {
    try {
      const path = pathname === "/" ? "./index.html" : "." + pathname;
      const data = await Deno.readFile(path);
      const ct = contentType(path) || "application/octet-stream";
      return new Response(data, { status: 200, headers: corsHeaders({ "Content-Type": ct }) });
    } catch (e) {
      return new Response("Not found", { status: 404, headers: corsHeaders() });
    }
  }

  // WebSocket upgrade path: /ws?room=ROOM
  if (pathname === "/ws") {
    // optional origin check
    const origin = req.headers.get("origin") || "";
    if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes("*")) {
      if (!ALLOWED_ORIGINS.includes(origin)) {
        return new Response("Forbidden origin", { status: 403, headers: corsHeaders() });
      }
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    const client: Client = { id: crypto.randomUUID(), ws: socket };

    socket.onopen = () => {
      const room = url.searchParams.get("room") || "default";
      client.room = room;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room)!.add(client);
      console.log(`WS open: ${client.id} room=${room} (members=${rooms.get(room)!.size})`);
      // Optionally send joined info
      const others = Array.from(rooms.get(room)!).filter(c => c.id !== client.id).map(c => c.id);
      socket.send(JSON.stringify({ type: "joined", id: client.id, peers: others }));
    };

    socket.onmessage = (ev) => {
      try {
        const room = client.room!;
        if (!room) return;
        const set = rooms.get(room);
        if (!set) return;
        // Relay message to all other peers in same room
        for (const c of set) {
          if (c !== client && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(ev.data);
          }
        }
      } catch (err) {
        console.error("ws msg error", err);
      }
    };

    socket.onclose = () => {
      const room = client.room;
      if (room && rooms.has(room)) {
        const set = rooms.get(room)!;
        set.delete(client);
        if (set.size === 0) rooms.delete(room);
      }
      console.log(`WS close: ${client.id} room=${room}`);
    };

    socket.onerror = (err) => {
      console.error("WS error:", err);
    };

    return response;
  }

  // Fallback - not found
  return new Response("Not found", { status: 404, headers: corsHeaders() });
}, { addr: ":8080" });
