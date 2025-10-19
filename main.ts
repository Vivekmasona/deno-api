// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Role = "broadcaster" | "listener";

interface Client {
  ws: WebSocket;
  role: Role;
  room: string;
}

const rooms = new Map<string, Set<Client>>();

console.log("🎧 Deno relay starting on :8080");

serve((req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    }});
  }

  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("This endpoint only supports WebSocket", { status: 400, headers: { "Access-Control-Allow-Origin": "*" }});
  }

  const url = new URL(req.url);
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    // nothing until client sends join json
    socket.send(JSON.stringify({ type: "welcome", msg: "send {type:'join', role:'broadcaster'|'listener', room:'ROOMID'}" }));
  };

  socket.onmessage = (evt) => {
    try {
      // Distinguish text (JSON control) vs binary frames (ArrayBuffer/Uint8Array)
      if (typeof evt.data === "string") {
        const msg = JSON.parse(evt.data || "{}");
        if (msg.type === "join" && msg.role && msg.room) {
          const client: Client = { ws: socket, role: msg.role, room: msg.room };
          if (!rooms.has(msg.room)) rooms.set(msg.room, new Set());
          rooms.get(msg.room)!.add(client);
          console.log("➡ join:", msg.role, msg.room, "clients:", rooms.get(msg.room)!.size);
          // notify others
          broadcastJson(msg.room, { type: "joined", role: msg.role });
          return;
        }

        // control messages from broadcaster (like 'init' metadata) or listeners
        if (msg.room && (msg.type === "init" || msg.type === "control")) {
          // forward to others in same room
          broadcastJson(msg.room, msg, socket);
        }
      } else {
        // binary frame: forward to matching room clients
        // We need to find which room this websocket belongs to
        const roomId = findClientRoom(socket);
        if (!roomId) return;
        const clients = rooms.get(roomId);
        if (!clients) return;
        for (const c of clients) {
          // forward to all listeners except origin
          if (c.ws !== socket && c.role === "listener" && c.ws.readyState === WebSocket.OPEN) {
            try { c.ws.send(evt.data); } catch (e) { /* ignore */ }
          }
        }
      }
    } catch (err) {
      console.error("onmessage error:", err);
    }
  };

  socket.onclose = () => {
    // remove from rooms
    for (const [room, set] of rooms.entries()) {
      for (const c of set) {
        if (c.ws === socket) {
          set.delete(c);
          console.log("⛔ client left room", room);
        }
      }
      if (set.size === 0) rooms.delete(room);
    }
  };

  socket.onerror = (e) => console.error("WS err:", e);

  return response;
}, { port: 8080 });

function findClientRoom(ws: WebSocket): string | null {
  for (const [room, set] of rooms.entries()) {
    for (const c of set) {
      if (c.ws === ws) return room;
    }
  }
  return null;
}

function broadcastJson(room: string, obj: any, except?: WebSocket) {
  const set = rooms.get(room);
  if (!set) return;
  const text = JSON.stringify(obj);
  for (const c of set) {
    if (except && c.ws === except) continue;
    if (c.ws.readyState === WebSocket.OPEN) {
      try { c.ws.send(text); } catch (_){ }
    }
  }
}
