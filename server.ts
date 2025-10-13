// Run with: deno run --allow-net server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface User {
  uid: string;
  ws: WebSocket;
  avatar: string;
  name: string;
}

const waitingUsers: User[] = [];
const rooms: Record<string, User[]> = {};

console.log("Deno WebSocket server running on :8080");

serve((req) => {
  const { socket, response } = Deno.upgradeWebSocket(req);
  let currentUser: User | null = null;
  let currentRoom: string | null = null;

  socket.onopen = () => {
    console.log("Client connected");
  };

  socket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);

      if (data.type === "join") {
        const uid = data.uid;
        currentUser = { uid, ws: socket, avatar: data.avatar, name: data.name };
        
        // Match user automatically
        if (waitingUsers.length > 0) {
          const peer = waitingUsers.shift()!;
          const room = `room_${crypto.randomUUID()}`;
          rooms[room] = [currentUser, peer];
          currentRoom = room;

          // Notify both users
          currentUser.ws.send(JSON.stringify({ type: "matched", room, peer: { uid: peer.uid, avatar: peer.avatar, name: peer.name } }));
          peer.ws.send(JSON.stringify({ type: "matched", room, peer: { uid: currentUser.uid, avatar: currentUser.avatar, name: currentUser.name } }));
        } else {
          waitingUsers.push(currentUser);
          currentUser.ws.send(JSON.stringify({ type: "waiting" }));
        }
      }

      // WebRTC signaling
      if (data.type === "signal" && currentRoom) {
        const peers = rooms[currentRoom];
        peers.forEach((u) => {
          if (u.uid !== currentUser!.uid) {
            u.ws.send(JSON.stringify({ ...data, from: currentUser!.uid }));
          }
        });
      }

      // Video request
      if (data.type === "video-request" && currentRoom) {
        const peers = rooms[currentRoom];
        peers.forEach((u) => {
          if (u.uid !== currentUser!.uid) {
            u.ws.send(JSON.stringify({ type: "video-request", from: currentUser!.uid }));
          }
        });
      }

      // Change user
      if (data.type === "change-user") {
        // Remove from waiting
        const idx = waitingUsers.findIndex(u => u.uid === currentUser!.uid);
        if (idx !== -1) waitingUsers.splice(idx,1);
        // Disconnect current
        currentUser!.ws.close();
      }

    } catch(err) {
      console.error(err);
    }
  };

  socket.onclose = () => {
    console.log("Client disconnected");
    // Remove from waiting
    if(currentUser){
      const idx = waitingUsers.findIndex(u => u.uid === currentUser!.uid);
      if(idx!==-1) waitingUsers.splice(idx,1);
    }
  };

  return response;
}, { port: 8080 });
