import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const BOT_TOKEN = "8149225352:AAF8pkM10sed_Yzkxz51gfyszDcQuXV1mgg";
const SVN_API_BASE = "https://svn-vivekfy.vercel.app/search/songs?query=";

serve(async (req) => {
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));

    if (body.message && body.message.text) {
      const chat_id = body.message.chat.id;
      const text = body.message.text;

      // Search song via SVN API
      const apiRes = await fetch(SVN_API_BASE + encodeURIComponent(text));
      const data = await apiRes.json().catch(() => null);

      if (data?.data?.results?.length > 0) {
        const song = data.data.results[0]; // take first result
        const audioUrl = song.downloadUrl[1]?.link || "";
        const title = song.name || "Unknown Title";
        const performer = song.primaryArtists || "Unknown Artist";
        const thumb = song.image[2]?.link || "";

        if (audioUrl) {
          // Send audio with play button
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id,
              audio: audioUrl,
              title: title,
              performer: performer,
              thumb: thumb,
            }),
          });
        } else {
          // fallback if audio not available
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id,
              text: `❌ Song not available: ${title}`,
            }),
          });
        }
      } else {
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

  return new Response("Hello! This is the VivekFy Bot.", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
});
