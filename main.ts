import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createCanvas, loadImage } from "https://deno.land/x/canvas@1.4.1/mod.ts";

const BOT_TOKEN = "8149225352:AAF8pkM10sed_Yzkxz51gfyszDcQuXV1mgg";
const SVN_API_BASE = "https://svn-vivekfy.vercel.app/search/songs?query=";

serve(async (req) => {
  const url = new URL(req.url);

  // Proxy to serve audio
  if (url.pathname.startsWith("/stream")) {
    const songUrl = url.searchParams.get("url");
    if (!songUrl) return new Response("No url", { status: 400 });

    const resp = await fetch(songUrl);
    return new Response(resp.body, {
      status: 200,
      headers: { "Content-Type": resp.headers.get("content-type") || "audio/mpeg" },
    });
  }

  // Proxy to generate poster with watermark
  if (url.pathname.startsWith("/poster")) {
    const imageUrl = url.searchParams.get("url");
    if (!imageUrl) return new Response("No image url", { status: 400 });

    const img = await loadImage(imageUrl);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(img, 0, 0, img.width, img.height);

    // Add watermark
    ctx.font = `${Math.floor(img.height / 10)}px Arial`;
    ctx.fillStyle = "rgba(231, 76, 60, 0.6)";
    ctx.textAlign = "center";
    ctx.fillText("Vivek", img.width / 2, img.height / 2);

    const png = canvas.toBuffer("image/png");
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  }

  // Telegram webhook
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const chat_id = body.message?.chat?.id;
    const text = body.message?.text?.trim();
    if (!chat_id || !text) return new Response("ok", { status: 200 });

    const apiRes = await fetch(SVN_API_BASE + encodeURIComponent(text));
    const data = await apiRes.json().catch(() => null);
    const song = data?.data?.results?.[0];
    if (!song) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text: "❌ No song found!" }),
      });
      return new Response("ok");
    }

    // Proxy URLs
    const audioProxy = `${url.origin}/stream?url=${encodeURIComponent(song.downloadUrl[1]?.link)}`;
    const posterProxy = `${url.origin}/poster?url=${encodeURIComponent(song.image[2]?.link)}`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id,
        audio: audioProxy,
        caption: `🎵 ${song.name}\n👤 ${song.primaryArtists || "Unknown"}`,
        thumb: posterProxy,
      }),
    });

    return new Response("ok", { status: 200 });
  }

  return new Response("Bot running", { status: 200 });
});
