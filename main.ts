import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const BOT_TOKEN = "8149225352:AAF8pkM10sed_Yzkxz51gfyszDcQuXV1mgg";
const SVN_API_BASE = "https://svn-vivekfy.vercel.app/search/songs?query=";

serve(async (req) => {
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));

    if (body.message?.text) {
      const chat_id = body.message.chat.id;
      const text = body.message.text;

      // Fetch song from SVN API
      const apiRes = await fetch(SVN_API_BASE + encodeURIComponent(text));
      const data = await apiRes.json().catch(() => null);

      if (data?.data?.results?.length > 0) {
        const song = data.data.results[0];
        const songUrl = song.downloadUrl[1]?.link || "";
        const songName = song.name;
        const artist = song.primaryArtists || "Unknown Artist";
        const poster = song.image[2]?.link || "";

        // Send audio with caption + poster
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id,
            audio: songUrl,
            caption: `🎵 ${songName}\n👤 ${artist}`,
            thumb: poster,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "⏮ Prev", callback_data: "prev" },
                  { text: "⏯ Play/Pause", callback_data: "playpause" },
                  { text: "⏭ Next", callback_data: "next" }
                ]
              ]
            }
          })
        });
      } else {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id,
            text: "❌ Song not found in SVN!"
          })
        });
      }
    }

    return new Response("ok", { status: 200 });
  }

  return new Response("Hello! Bot is running.", { status: 200 });
});
