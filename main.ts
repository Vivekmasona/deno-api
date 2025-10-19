import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const listeners = new Set<WebSocket>();
let broadcaster: WebSocket | null = null;

serve((req) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("🎧 FM signaling server running");
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "broadcaster") {
      broadcaster = socket;
      console.log("🎙️ Broadcaster connected");
    }

    if (msg.type === "listener") {
      listeners.add(socket);
      console.log("🎧 Listener connected");
      if (broadcaster)
        broadcaster.send(JSON.stringify({ type: "new-listener" }));
    }

    if (msg.type === "offer" && broadcaster !== socket) {
      // listener offer → broadcaster
      broadcaster?.send(JSON.stringify({ type: "offer", payload: msg.payload }));
    }

    if (msg.type === "answer" && socket !== broadcaster) {
      // broadcaster answer → all listeners
      for (const l of listeners)
        l.send(JSON.stringify({ type: "answer", payload: msg.payload }));
    }

    if (msg.type === "candidate") {
      // relay ICE candidates
      if (broadcaster && socket !== broadcaster)
        broadcaster.send(JSON.stringify(msg));
      else
        for (const l of listeners) l.send(JSON.stringify(msg));
    }
  };

  socket.onclose = () => {
    if (socket === broadcaster) broadcaster = null;
    listeners.delete(socket);
  };

  return response;
}, { port: 8080 });
