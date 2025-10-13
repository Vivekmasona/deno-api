// main.ts (Deno)
// -- only works for small demo, but scalable pattern
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface User { uid: string; ws: WebSocket; }

const onlineUsers: User[] = [];
const rooms: Record<string, User[]> = {};

serve(req => {
  const url = new URL(req.url);
  if(url.pathname==='/') return new Response(html,{headers:{'content-type':'text/html'}});
  if(url.pathname==='/ws'){
    const {socket,response}=Deno.upgradeWebSocket(req);
    let currentUser: User|null = null;

    socket.onmessage=e=>{
      const data=JSON.parse(e.data);
      if(data.type==='join'){
        currentUser={uid:data.uid,ws:socket};
        onlineUsers.push(currentUser);
      }
      if(data.type==='signal'){
        const room=rooms[data.room];
        room?.forEach(u=>{if(u.uid!==currentUser?.uid) u.ws.send(JSON.stringify(data));});
      }
      if(data.type==='change-user'){
        onlineUsers.splice(onlineUsers.findIndex(u=>u.uid===currentUser?.uid),1);
        socket.close();
      }
    }

    socket.onclose=()=>{
      if(currentUser) onlineUsers.splice(onlineUsers.findIndex(u=>u.uid===currentUser?.uid),1);
      for(const room in rooms){ rooms[room]=rooms[room].filter(u=>u.uid!==currentUser?.uid); if(rooms[room].length===0) delete rooms[room]; }
    }

    return response;
  }
  return new Response("404",{status:404});
},{port:8080});

// Automatic pairing (simple logic, scalable version would use Redis queue)
setInterval(()=>{
  const shuffled=[...onlineUsers].sort(()=>Math.random()-0.5);
  for(let i=0;i+1<shuffled.length;i+=2){
    const a=shuffled[i],b=shuffled[i+1];
    const room=`room_${crypto.randomUUID()}`;
    rooms[room]=[a,b];
    a.ws.send(JSON.stringify({type:'matched',room,peer:b.uid}));
    b.ws.send(JSON.stringify({type:'matched',room,peer:a.uid}));
  }
},5000);

const html=`
<!DOCTYPE html><html><body>
<script>
const uid=localStorage.getItem('uid')||crypto.randomUUID();
localStorage.setItem('uid',uid);
const ws=new WebSocket('ws://'+location.host+'/ws');
ws.onopen=()=>ws.send(JSON.stringify({type:'join',uid}));
ws.onmessage=e=>{console.log('Server:',e.data);}
</script>
</body></html>
`;
