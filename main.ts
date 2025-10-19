// === FM Live Streaming Server (Real-time) ===
// Deploy: https://vfy-call.deno.dev

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let listeners: ((chunk: Uint8Array) => void)[] = [];
let isStreaming = false;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

console.log("🎧 FM Live Stream Server running...");

serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { headers });

  // === Upload / Stream audio ===
  if (url.pathname === "/upload" && req.method === "POST") {
    if (!req.body) return new Response("No body", { status: 400, headers });
    isStreaming = true;
    console.log("🎙️ Broadcaster streaming started...");

    const reader = req.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          for (const send of listeners) send(value);
        }
      }
    } catch (e) {
      console.error("Stream error:", e);
    } finally {
      isStreaming = false;
      listeners = [];
      console.log("🛑 Broadcaster ended stream");
    }
    return new Response("OK", { headers });
  }

  // === Listener ===
  if (url.pathname === "/listen" && req.method === "GET") {
    const body = new ReadableStream({
      start(controller) {
        const push = (chunk: Uint8Array) => controller.enqueue(chunk);
        listeners.push(push);
        if (!isStreaming) {
          const interval = setInterval(() => {
            if (!isStreaming) return;
            clearInterval(interval);
          }, 1000);
        }
      },
      cancel() {
        listeners = listeners.filter(fn => fn !== controller.enqueue);
      }
    });

    const resHeaders = {
      ...headers,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked",
    };

    console.log("🎧 Listener connected");
    return new Response(body, { headers: resHeaders });
  }

  // === Webpage ===
  if (url.pathname === "/") {
    const html = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>🎧 VFY Live FM</title>
<style>
  body { background:#000; color:#fff; font-family:sans-serif; text-align:center; padding:30px; }
  button { background:#0f0; border:none; padding:12px 25px; border-radius:10px; font-size:16px; margin:10px; cursor:pointer; }
  input { margin:10px; }
</style>
</head>
<body>
  <h1>🎙️ VFY Live FM</h1>
  <input type="file" id="fileInput" accept="audio/*">
  <button id="startBtn">Start Stream</button>
  <p id="status">Idle...</p>
  <hr/>
  <h2>🎧 Live Stream</h2>
  <audio id="player" controls autoplay></audio>

<script>
const server = location.origin;
const player = document.getElementById('player');
const status = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const fileInput = document.getElementById('fileInput');

// === Broadcaster ===
startBtn.onclick = async () => {
  const file = fileInput.files[0];
  if (!file) return alert("Select an audio file first!");

  status.innerText = "🎙️ Streaming Live...";
  const stream = file.stream();
  const reader = stream.getReader();
  const resp = await fetch(server + "/upload", {
    method: "POST",
    body: new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        controller.enqueue(value);
      }
    })
  });
  status.innerText = "✅ Stream Ended.";
};

// === Listener ===
async function listen() {
  try {
    player.src = server + "/listen?" + Date.now();
    await player.play();
  } catch {
    status.innerText = "Waiting for live stream...";
    setTimeout(listen, 3000);
  }
}
listen();
</script>
</body>
</html>
`;
    return new Response(html, { headers: { ...headers, "Content-Type": "text/html" } });
  }

  return new Response("FM Server Active", { headers });
});
