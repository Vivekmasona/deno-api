import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const BOT_TOKEN = "8149225352:AAF8pkM10sed_Yzkxz51gfyszDcQuXV1mgg";
const SVN_API_BASE = "https://svn-vivekfy.vercel.app/search/songs?query=";

serve(async (req) => {
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const chat_id = body.message?.chat?.id;
    const text = body.message?.text?.trim();

    if (!chat_id || !text) return new Response("ok", { status: 200 });

    // Fetch top 10 songs
    const apiRes = await fetch(SVN_API_BASE + encodeURIComponent(text));
    const data = await apiRes.json().catch(() => null);
    const songs = data?.data?.results?.slice(0, 10) || [];

    if (songs.length === 0) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text: "❌ No songs found!" }),
      });
      return new Response("ok");
    }

    // Send each song as separate audio (native play button, no download)
    for (const song of songs) {
      const songUrl = song.downloadUrl[1]?.link;
      if (!songUrl) continue;

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          audio: songUrl,
          caption: `🎵 ${song.name}\n👤 ${song.primaryArtists || "Unknown Artist"}`,
          thumb: song.image[2]?.link || "",
        }),
      });
    }

    return new Response("ok", { status: 200 });
  }

  return new Response("Bot running", { status: 200 });
});
