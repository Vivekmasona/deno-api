import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const BOT_TOKEN = "8149225352:AAF8pkM10sed_Yzkxz51gfyszDcQuXV1mgg";
const SVN_API_BASE = "https://svn-vivekfy.vercel.app/search/songs?query=";

serve(async (req) => {
  const { pathname } = new URL(req.url);

  // Telegram webhook POST
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));

    if (body.message && body.message.text) {
      const chat_id = body.message.chat.id;
      const text = body.message.text;

      // Search song via SVN API
      const apiRes = await fetch(SVN_API_BASE + encodeURIComponent(text));
      const data = await apiRes.json().catch(() => null);

      if (data?.data?.results?.length > 0) {
        const song = data.data.results[0]; // pick first result
        const songUrl = song.downloadUrl[1]?.link || "";
        const songName = song.name;

        // Send message with song info and link
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id,
            text: `🎵 ${songName}\nPlay here: ${songUrl}`,
          }),
        });
      } else {
        // No song found
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id,
            text: "❌ Song not found in SVN!",
          }),
        });
      }
    }

    return new Response("ok", { status: 200 });
  }

  // GET → show HTML player page
  if (req.method === "GET") {
    return new Response(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>VivekFy Bot Player</title>
      </head>
      <body>
        <h2>VivekFy Bot Music Player</h2>
        <input type="text" id="songInput" placeholder="Type song name"/>
        <button onclick="playSong()">Play</button>
        <p id="status"></p>
        <audio id="audioPlayer" controls></audio>

        <script>
          async function playSong() {
            const name = document.getElementById('songInput').value.trim();
            if (!name) return;

            document.getElementById('status').textContent = "Searching...";
            const res = await fetch("${SVN_API_BASE}" + encodeURIComponent(name));
            const data = await res.json();

            if (data?.data?.results?.length > 0) {
              const song = data.data.results[0];
              const url = song.downloadUrl[1]?.link || "";
              const audio = document.getElementById('audioPlayer');
              audio.src = url;
              audio.play();
              document.getElementById('status').textContent = "Playing: " + song.name;
            } else {
              document.getElementById('status').textContent = "Song not found!";
            }
          }
        </script>
      </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  }

  return new Response("Not found", { status: 404 });
});
