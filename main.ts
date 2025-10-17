import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Client {
  id: string;
  socket: WebSocket;
  mode: "sender" | "receiver";
  lat: number;
  lon: number;
  Ytid?: string;
}

const clients = new Map<string, Client>();

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
  };
}

function nearMatch(a: number, b: number, tolerance = 10) {
  const toInt = (x: number) => Math.round((x * 1e5) % 1e5);
  return Math.abs(toInt(a) - toInt(b)) <= tolerance;
}

serve((req) => {
  const { pathname } = new URL(req.url);

  if (pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const id = crypto.randomUUID();

    const client: Client = {
      id,
      socket,
      mode: "receiver",
      lat: 0,
      lon: 0,
      Ytid: undefined,
    };

    clients.set(id, client);
    console.log(`🔗 New client connected: ${id}`);

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "update") {
          client.lat = msg.lat;
          client.lon = msg.lon;
          client.mode = msg.mode;
          client.Ytid = msg.Ytid;
          clients.set(id, client);

          // find nearby receivers for this sender
          if (client.mode === "sender" && client.Ytid) {
            for (const other of clients.values()) {
              if (
                other.mode === "receiver" &&
                nearMatch(client.lat, other.lat) &&
                nearMatch(client.lon, other.lon)
              ) {
                other.socket.send(
                  JSON.stringify({
                    type: "play",
                    Ytid: client.Ytid,
                    from: client.id,
                  }),
                );
              }
            }
          }
        }
      } catch (err) {
        console.error("⚠️ Error:", err);
      }
    };

    socket.onclose = () => {
      clients.delete(id);
      console.log(`❌ Disconnected: ${id}`);
    };

    return response;
  }

  if (pathname === "/check") {
    return new Response(
      JSON.stringify(
        Array.from(clients.values()).map((c) => ({
          id: c.id,
          mode: c.mode,
          lat: c.lat,
          lon: c.lon,
          Ytid: c.Ytid,
        })),
        null,
        2,
      ),
      { headers: { "content-type": "application/json", ...cors() } },
    );
  }

  return new Response("🎶 Realtime GeoSync WebSocket Server Active", {
    headers: cors(),
  });
});
