import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const BOT_TOKEN = "8149225352:AAF8pkM10sed_Yzkxz51gfyszDcQuXV1mgg";
const SVN_API_BASE = "https://svn-vivekfy.vercel.app/search/songs?query=";

serve(async (req) => {
  const url = new URL(req.url);

  // Proxy endpoint to serve audio to Telegram
  if (url.pathname.startsWith("/stream")) {
    const songUrl = url.searchParams.get("url");
    if (!songUrl) return new Response("No url", { status: 400 });

    // Fetch the SVN audio and stream to Telegram
    const resp = await fetch(songUrl);
    const body = resp.body;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": resp.headers.get("content-type") || "audio/mpeg",
      },
    });
  }

  // Telegram webhook
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const chat_id = body.message?.chat?.id;
    const text = body.message?.text?.trim();

    if (!chat_id || !text) return new Response("ok", { status: 200 });

    // Fetch top 10 songs from SVN API
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

    // Send each song as native Telegram audio using proxy
    for (const song of songs) {
      const originalUrl = song.downloadUrl[1]?.link;
      if (!originalUrl) continue;

      // Proxy URL
      const proxyUrl = `${url.origin}/stream?url=${encodeURIComponent(originalUrl)}`;

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          audio: proxyUrl,
          caption: `🎵 ${song.name}\n👤 ${song.primaryArtists || "Unknown"}`,
          thumb: song.image[2]?.link || "",
        }),
      });
    }

    return new Response("ok", { status: 200 });
  }

  return new Response("Bot running", { status: 200 });
});
