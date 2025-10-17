// server.ts
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";

interface User {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
  ws: WebSocket;
}
const users = new Map<string, User>();

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkAll() {
  for (const [id1, u1] of users) {
    if (u1.lat == null || u1.lon == null) continue;
    for (const [id2, u2] of users) {
      if (id1 === id2 || u2.lat == null || u2.lon == null) continue;
      const d = distanceMeters(u1.lat, u1.lon, u2.lat, u2.lon);
      if (d <= 100) {
        try {
          u1.ws.send(
            JSON.stringify({
              type: "near",
              name: u2.name,
              distance: Math.round(d),
            }),
          );
          u2.ws.send(
            JSON.stringify({
              type: "near",
              name: u1.name,
              distance: Math.round(d),
            }),
          );
        } catch {}
      }
    }
  }
}

serve((req) => {
  const { socket, response } = Deno.upgradeWebSocket(req);
  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "register") {
      users.set(msg.id, { id: msg.id, name: msg.name, ws: socket });
    } else if (msg.type === "update") {
      const u = users.get(msg.id);
      if (u) {
        u.lat = msg.lat;
        u.lon = msg.lon;
      }
    }
  };
  socket.onclose = () => {
    for (const [id, u] of users) if (u.ws === socket) users.delete(id);
  };
  return response;
}, { port: 8000 });

setInterval(checkAll, 2000); // check every 2 s

console.log("Server running on http://localhost:8000");
