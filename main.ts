// main.ts — WebSocket + Geo pairing + Sync System
import { serve } from "https://deno.land/std@0.202.0/http/server.ts";

interface Client {
  id: string;
  socket: WebSocket;
  lat?: number;
  lon?: number;
  Ytid?: string;
  lastReceivedFrom: Map<string, string>;
}

const clients = new Map<string, Client>();
const DISTANCE_THRESHOLD_M = 100; // 100 meter range

// Distance formula (Haversine)
function distance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Pair alert
function notifyPair(sender: Client, receiver: Client) {
  const data = {
    type: "paired",
    from: sender.id,
    to: receiver.id,
    ts: Date.now(),
  };
  try { sender.socket.send(JSON.stringify(data)); } catch {}
  try { receiver.socket.send(JSON.stringify(data)); } catch {}
  console.log(`🔗 Pair established between ${sender.id} and ${receiver.id}`);
}

// When sender updates YouTube ID
function handleSenderNewYtid(sender: Client) {
  for (const [_, c] of clients) {
    if (c.id === sender.id || !c.lat || !c.lon || !sender.lat || !sender.lon)
      continue;

    const d = distance(sender.lat, sender.lon, c.lat, c.lon);
    if (d <= DISTANCE_THRESHOLD_M) {
      notifyPair(sender, c);
      const last = c.lastReceivedFrom.get(sender.id);
      if (last === sender.Ytid) continue;
      sendToReceiver(c, sender.id, sender.Ytid!);
    }
  }
}

// Send song ID to receiver
function sendToReceiver(receiver: Client, from: string, id: string) {
  try {
    receiver.socket.send(JSON.stringify({ type: "update", from, id }));
    receiver.lastReceivedFrom.set(from, id);
  } catch {}
}

serve((req) => {
  const { socket, response } = Deno.upgradeWebSocket(req);
  const id = crypto.randomUUID();
  const client: Client = {
    id,
    socket,
    lastReceivedFrom: new Map(),
  };
  clients.set(id, client);

  socket.onopen = () => {
    console.log("✅ Client connected:", id);
    socket.send(JSON.stringify({ type: "welcome", id }));
  };

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "updateLocation") {
        client.lat = msg.lat;
        client.lon = msg.lon;
      } else if (msg.type === "sender" && msg.Ytid) {
        client.Ytid = msg.Ytid;
        handleSenderNewYtid(client);
      }
    } catch (err) {
      console.error("Parse error:", err);
    }
  };

  socket.onclose = () => {
    console.log("❌ Disconnected:", id);
    clients.delete(id);
  };

  return response;
});
