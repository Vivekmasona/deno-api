// main.ts
// Run: deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface User {
  uid: string;
  ws: WebSocket;
  avatar: string;
  name: string;
}

const onlineUsers: User[] = [];
const rooms: Record<string, User[]> = {};

console.log("Deno WebRTC Call Server running on :8080");

serve((req) => {
  const url = new URL(req.url);
  if (url.pathname === "/") {
    return new Response(frontendHTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  if (url.pathname === "/ws") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    let currentUser: User | null = null;
    let currentRoom: string | null = null;

    socket.onopen = () => console.log("Client connected");

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === "join") {
          const uid = data.uid;
          currentUser = { uid, ws: socket, avatar: data.avatar, name: data.name };
          onlineUsers.push(currentUser);
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
          const idx = onlineUsers.findIndex(u => u.uid === currentUser!.uid);
          if (idx !== -1) onlineUsers.splice(idx,1);
          socket.close();
        }

      } catch(err) { console.error(err); }
    };

    socket.onclose = () => {
      if(currentUser){
        const idx = onlineUsers.findIndex(u => u.uid === currentUser!.uid);
        if(idx!==-1) onlineUsers.splice(idx,1);
        // Remove from any room
        for(const room in rooms){
          rooms[room] = rooms[room].filter(u => u.uid !== currentUser!.uid);
          if(rooms[room].length === 0) delete rooms[room];
        }
      }
      console.log("Client disconnected");
    };

    return response;
  }

  return new Response("Not Found", { status: 404 });
}, { port: 8080 });

// ----- Auto Pairing every 5 seconds -----
setInterval(() => {
  while(onlineUsers.length >= 2){
    const a = onlineUsers.shift()!;
    const b = onlineUsers.shift()!;
    const room = `room_${crypto.randomUUID()}`;
    rooms[room] = [a,b];

    a.ws.send(JSON.stringify({ type:"matched", room, peer:{uid:b.uid, avatar:b.avatar, name:b.name} }));
    b.ws.send(JSON.stringify({ type:"matched", room, peer:{uid:a.uid, avatar:a.avatar, name:a.name} }));
  }
}, 5000);

const frontendHTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Deno Audio/Video Call</title>
<style>
body{font-family:sans-serif;background:#f2f4f7;margin:0;display:flex;justify-content:center;align-items:center;height:100vh;}
#app{text-align:center;width:400px;}
.stage{position:relative;width:100%;height:300px;margin-bottom:10px;}
.center-icon{width:100px;height:100px;border-radius:50%;background:#ddd;overflow:hidden;margin:0 auto;position:relative;}
.center-icon img{width:100%;height:100%;object-fit:cover;}
.wave{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;animation:none;}
.peer-thumb{position:absolute;width:50px;height:50px;border-radius:50%;overflow:hidden;opacity:0;transition:all 1.2s ease;}
.peer-thumb img{width:100%;height:100%;object-fit:cover;}
button{padding:8px 14px;border:0;border-radius:6px;background:#2b6df6;color:#fff;cursor:pointer;position:fixed;bottom:20px;left:50%;transform:translateX(-50%);}
#changeBtn{bottom:70px;}
#status{margin-top:6px;color:#333;}
video{width:150px;height:150px;border-radius:12px;margin:2px;}
</style>
</head>
<body>
<div id="app">
<div class="stage">
  <div class="wave" id="waveContainer"></div>
  <div class="center-icon" id="youIcon"><img id="youImg" src="" alt="you"></div>
  <div class="peer-thumb" id="peerThumb"></div>
</div>
<div id="status">Initializing...</div>
<button id="videoBtn">Request Video Call</button>
<button id="changeBtn">Change User</button>
<video id="localVideo" autoplay muted playsinline style="display:none;"></video>
<video id="remoteVideo" autoplay playsinline style="display:none;"></video>
</div>

<script>
let uidKey='autoMatchUID';
let userId=localStorage.getItem(uidKey)||crypto.randomUUID();
localStorage.setItem(uidKey,userId);
let avatar='https://i.pravatar.cc/200?u='+userId;
document.getElementById('youImg').src=avatar;
let ws=new WebSocket('ws://'+location.host+'/ws');
let pc=null, localStream=null, roomId=null, peerId=null, videoRequested=false;
let peerThumb=document.getElementById('peerThumb');
let waveContainer=document.getElementById('waveContainer');
let statusEl=document.getElementById('status');

ws.onopen=()=>{ ws.send(JSON.stringify({type:'join',uid:userId,avatar:avatar,name:'anon'})); };

ws.onmessage=async (e)=>{
  const data=JSON.parse(e.data);
  if(data.type==='waiting'){ statusEl.innerText='Waiting for peer...'; }
  if(data.type==='matched'){
    roomId=data.room; peerId=data.peer.uid;
    showWave(data.peer);
    statusEl.innerText='Matched with '+data.peer.name;
    startAudioCall();
  }
  if(data.type==='signal'){
    if(!pc) return;
    if(data.sdp){
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      if(data.sdp.type==='offer'){
        const ans=await pc.createAnswer();
        await pc.setLocalDescription(ans);
        ws.send(JSON.stringify({type:'signal',room:roomId,sdp:ans}));
      }
    }
    if(data.candidate){
      try{ await pc.addIceCandidate(data.candidate); }catch(e){}
    }
  }
  if(data.type==='video-request' && !videoRequested){
    if(confirm('Peer requests video call. Accept?')){
      videoRequested=true;
      startVideoTrack();
    }
  }
};

async function startAudioCall(){
  localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
  document.getElementById('localVideo').srcObject=localStream;
  pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  pc.ontrack=e=>{ document.getElementById('remoteVideo').srcObject=e.streams[0]; document.getElementById('remoteVideo').style.display='block'; };
  pc.onicecandidate=e=>{ if(e.candidate) ws.send(JSON.stringify({type:'signal',room:roomId,candidate:e.candidate})); };
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  const offer=await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({type:'signal',room:roomId,sdp:offer}));
}

async function startVideoTrack(){
  if(!pc) return;
  const vs=await navigator.mediaDevices.getUserMedia({video:true});
  vs.getTracks().forEach(t=>pc.addTrack(t,vs));
  localStream.addTrack(vs.getVideoTracks()[0]);
  document.getElementById('localVideo').srcObject=localStream;
  document.getElementById('localVideo').style.display='block';
}

function showWave(peer){
  const w=document.createElement('div');
  w.className='wave';
  w.style.width='0px'; w.style.height='0px'; w.style.background='rgba(43,109,246,0.18)';
  w.style.animation='expandWave 5s linear forwards';
  waveContainer.appendChild(w);
  peerThumb.style.left='80%'; peerThumb.style.top='30%';
  peerThumb.innerHTML='<img src="'+peer.avatar+'" />';
  peerThumb.style.opacity='1';
  setTimeout(()=>{ peerThumb.style.left='50%'; peerThumb.style.top='50%'; peerThumb.style.transform='translate(-50%,-50%) scale(1)'; },1200);
  setTimeout(()=>{ w.remove(); peerThumb.style.opacity='0'; setTimeout(()=> peerThumb.innerHTML='',600); },5200);
}

document.getElementById('videoBtn').addEventListener('click',()=>{
  if(!roomId){ alert('No peer yet'); return; }
  ws.send(JSON.stringify({type:'video-request',room:roomId}));
});

document.getElementById('changeBtn').addEventListener('click',()=>{
  ws.send(JSON.stringify({type:'change-user'}));
  userId=crypto.randomUUID();
  localStorage.setItem(uidKey,userId);
  avatar='https://i.pravatar.cc/200?u='+userId;
  document.getElementById('youImg').src=avatar;
  roomId=null; peerId=null;
  if(pc){ pc.close(); pc=null; }
  ws=new WebSocket('ws://'+location.host+'/ws');
  ws.onopen=()=>{ ws.send(JSON.stringify({type:'join',uid:userId,avatar:avatar,name:'anon'})); };
  ws.onmessage=async (e)=>{ location.reload(); };
});

const style=document.createElement('style');
style.innerHTML=\`@keyframes expandWave {0%{width:0;height:0;opacity:0.9;transform:translate(-50%,-50%) scale(0.1);}100%{width:400px;height:400px;opacity:0;transform:translate(-50%,-50%) scale(1);}}\`;
document.head.appendChild(style);
</script>
</body>
</html>
`;
