import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const listeners = new Set<WebSocket>();
let host: WebSocket | null = null;

console.log("🎧 Bihar FM Deno WebSocket Stream Ready");

serve((req) => {
  const { pathname } = new URL(req.url);

  // Basic route info
  if (pathname === "/") {
    return new Response("🎙 Bihar FM Stream Server is Live!", {
      headers: { "content-type": "text/plain" },
    });
  }

  // WebSocket upgrade
  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    let role: "host" | "listener" | null = null;

    socket.onmessage = (e) => {
      // Host/Listener registration
      if (typeof e.data === "string") {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "register") {
            role = msg.role;
            if (role === "host") {
              host = socket;
              console.log("🎙 Host connected");
              // Inform listeners
              for (const l of listeners)
                l.send(JSON.stringify({ type: "status", msg: "Host live" }));
            }
            if (role === "listener") {
              listeners.add(socket);
              console.log(`🎧 Listener joined (${listeners.size})`);
            }
          }
        } catch {}
        return;
      }

      // If binary chunk from host, forward to listeners
      if (role === "host" && e.data instanceof Uint8Array) {
        for (const l of listeners) {
          if (l.readyState === WebSocket.OPEN) l.send(e.data);
        }
      }
    };

    socket.onclose = () => {
      if (role === "host") {
        console.log("⛔ Host disconnected");
        host = null;
        for (const l of listeners)
          l.send(JSON.stringify({ type: "status", msg: "Host offline" }));
      } else if (role === "listener") {
        listeners.delete(socket);
        console.log(`❌ Listener left (${listeners.size})`);
      }
    };

    return response;
  }

  return new Response("Not Found", { status: 404 });
});
