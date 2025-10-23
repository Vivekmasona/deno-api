import { serve } from "https://deno.land/std/http/server.ts";

const clients = new Map<string, { ws: WebSocket; role?: string }>();
function safeSend(ws: WebSocket, data: unknown) {
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  } catch (_) {}
}
function uid() {
  return crypto.randomUUID();
}

console.log("🎧 FM Deno Signaling Server Ready");

serve(async (req) => {
  const url = new URL(req.url);

  // ✅ Serve default mp3 at /listener.mp3
  if (url.pathname === "/listener.mp3") {
    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Access-Control-Allow-Origin": "*",
    });

    // Either serve a local file OR fetch from remote CDN
    // 1️⃣ Serve local file (if deployed with it)
    try {
      const file = await Deno.readFile("./listener.mp3");
      return new Response(file, { headers });
    } catch {
      // 2️⃣ Or fallback to remote CDN URL
      const resp = await fetch("https://cdn.example.com/default.mp3");
      return new Response(await resp.arrayBuffer(), { headers });
    }
  }

  // ✅ Handle WebSocket (same as before)
  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req, { idleTimeout: 120 });
    const id = uid();
    clients.set(id, { ws: socket });
    console.log("🔗 Connected:", id);

    safeSend(socket, { type: "connected", id });

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const { type, role, target, payload } = msg;
        if (type === "register") {
          clients.get(id)!.role = role;
          console.log(`🧩 ${id} registered as ${role}`);
          if (role === "listener") {
            for (const [, c] of clients)
              if (c.role === "broadcaster")
                safeSend(c.ws, { type: "listener-joined", id });
          }
        }
        if (["offer", "answer", "candidate"].includes(type) && target) {
          const t = clients.get(target);
          if (t) safeSend(t.ws, { type, from: id, payload });
        }
      } catch (err) {
        console.error("⚠️ Parse error:", err);
      }
    };

    socket.onclose = () => {
      clients.delete(id);
      console.log("❌ Disconnected:", id);
      for (const [, c] of clients)
        if (c.role === "broadcaster") safeSend(c.ws, { type: "peer-left", id });
    };

    socket.onerror = (err) => {
      console.error("💥 Socket error:", err);
      try { socket.close(); } catch (_) {}
      clients.delete(id);
    };

    return response;
  }

  // ✅ Default response for all other routes
  return new Response("🎧 Deno FM WebRTC Signaling Server Live!", {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
});
