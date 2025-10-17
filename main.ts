// main.ts
// Run: deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";

const clients = new Map<string, any>();
let lastYtid = ""; // Last YouTube video ID stored

function distance(lat1:number, lon1:number, lat2:number, lon2:number) {
  const R = 6371000;
  const toRad = (d:number)=>d*Math.PI/180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function handleWS(req: Request) {
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.type === "update") {
        clients.set(data.id, { ...data, ws: socket, last: Date.now() });

        if (data.Ytid) lastYtid = data.Ytid; // update last YT id

        for (const [otherId, c] of clients.entries()) {
          if (otherId === data.id) continue;
          const d = distance(data.lat, data.lon, c.lat, c.lon);
          if (d <= 100 && lastYtid) {
            // send latest YTID to both devices
            try { c.ws.send(JSON.stringify({ type: "play", Ytid: lastYtid })); } catch {}
            try { socket.send(JSON.stringify({ type: "play", Ytid: lastYtid })); } catch {}
            console.log(`📡 Devices ${data.id} & ${otherId} within ${Math.round(d)}m → sharing ${lastYtid}`);
          }
        }
      }
    } catch (e) {
      console.error("Invalid WS message:", e);
    }
  };

  socket.onclose = () => {
    for (const [id, c] of clients.entries()) if (c.ws === socket) clients.delete(id);
  };

  return response;
}

serve((req) => {
  if (req.headers.get("upgrade") === "websocket") return handleWS(req);
  return new Response("🎧 VFY proximity server running", { headers: { "content-type": "text/plain" } });
}, { port: 8000 });

console.log("🟢 Server running on ws://localhost:8000/ws");
