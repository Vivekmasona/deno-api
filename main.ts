// === FM Live Stream Server ===
// Deploy at: https://vfy-call.deno.dev/

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let currentStream: ReadableStream<Uint8Array> | null = null;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

console.log("🎧 Live FM server started...");

serve(async (req) => {
  const url = new URL(req.url);

  // preflight
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // === upload (broadcaster)
  if (url.pathname === "/upload" && req.method === "POST") {
    const { readable, writable } = new TransformStream();
    currentStream = readable;

    const reader = req.body?.getReader();
    const writer = writable.getWriter();

    console.log("🎙️ Broadcaster started streaming...");

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader!.read();
          if (done) break;
          writer.write(value);
        }
      } catch (err) {
        console.error("Upload error:", err);
      } finally {
        writer.close();
        currentStream = null;
        console.log("🛑 Stream ended");
      }
    })();

    return new Response("OK", { headers: cors });
  }

  // === listener
  if (url.pathname === "/listen" && req.method === "GET") {
    if (!currentStream) {
      return new Response("No live stream", { status: 404, headers: cors });
    }

    const headers = {
      ...cors,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked",
    };

    console.log("🎧 Listener connected");
    return new Response(currentStream.pipeThrough(new TransformStream()), { headers });
  }

  // === main page
  if (url.pathname === "/" && req.method === "GET") {
    const html = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>🎧 VFY FM Live</title>
<style>
  body { background:#000; color:#fff; text-align:center; font-family:sans-serif; padding:40px; }
  h1 { color:#0f0; }
  button { background:#0f0; border:none; padding:10px 20px; font-size:18px; border-radius:10px; margin:10px; }
  input { margin:10px; color:#fff; }
</style>
</head>
<body>
  <h1>🎙️ VFY Live FM</h1>
  <input type="file" id="fileInput" accept="audio/*">
  <button id="streamBtn">Start Stream</button>
  <p id="status">Idle...</p>
  <hr>
  <h2>🎧 Live Listening</h2>
  <audio id="audio" controls autoplay></audio>
  <p id="msg"></p>

<script>
const server = location.origin;
const fileInput = document.getElementById('fileInput');
const status = document.getElementById('status');
const streamBtn = document.getElementById('streamBtn');
const audio = document.getElementById('audio');
const msg = document.getElementById('msg');

// === Broadcaster ===
streamBtn.onclick = async () => {
  const file = fileInput.files[0];
  if (!file) return alert("Select an audio file first!");
  status.innerText = "📡 Streaming live...";
  await fetch(server + "/upload", { method: "POST", body: file.stream() });
  status.innerText = "✅ Stream ended.";
};

// === Listener ===
async function listenLive() {
  try {
    audio.src = server + "/listen?" + Date.now();
    await audio.play();
    msg.innerText = "🎶 Live stream playing...";
  } catch {
    msg.innerText = "Waiting for live stream...";
    setTimeout(listenLive, 5000);
  }
}

listenLive();
</script>
</body>
</html>
    `;
    return new Response(html, { headers: { ...cors, "Content-Type": "text/html" } });
  }

  return new Response("FM Server Ready", { headers: cors });
});
