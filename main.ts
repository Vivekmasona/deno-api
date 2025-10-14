// main.ts — Deno native YouTube extractor + proxy
// Run: deno run --allow-net --allow-env main.ts
// Example:
//   /formats?url=https://youtu.be/FkFvdukWpAI
//   /stream?url=<encoded_googlevideo_url>

import { Innertube } from "npm:youtubei.js";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// YouTube internal API client
let yt: Innertube | null = null;
async function getClient() {
  if (!yt) yt = await Innertube.create();
  return yt;
}

// Extract YouTube video ID
function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : url;
}

// Get all formats (itag, url, bitrate, qualityLabel...)
async function getFormats(videoUrl: string) {
  const client = await getClient();
  const id = extractVideoId(videoUrl);
  const info = await client.getInfo(id);

  const all = [
    ...info.streaming_data?.formats || [],
    ...info.streaming_data?.adaptive_formats || [],
  ];

  return all.map((f: any) => ({
    itag: f.itag,
    mimeType: f.mime_type,
    qualityLabel: f.quality_label || null,
    bitrate: f.bitrate,
    audioBitrate: f.audio_bitrate || null,
    contentLength: f.content_length,
    url: f.decipher(client.session.player) // resolve signature
  }));
}

// Stream proxy (403 safe)
async function handleStream(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  if (!target) return new Response("Missing ?url", { status: 400 });

  const ytRes = await fetch(target, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Referer": "https://www.youtube.com/",
      "Origin": "https://www.youtube.com",
      "Range": req.headers.get("Range") || undefined,
    },
  });

  const headers = new Headers(ytRes.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "*");

  return new Response(ytRes.body, {
    status: ytRes.status,
    headers,
  });
}

// Server routes
serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/formats") {
    const url = searchParams.get("url");
    if (!url) return new Response("Missing ?url", { status: 400 });

    try {
      const formats = await getFormats(url);
      return new Response(JSON.stringify({ videoFormats: formats }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (pathname === "/stream") return handleStream(req);

  return new Response(
    `✅ Deno YouTube Extractor Running!
Use /formats?url=... to list all itags.
Use /stream?url=... to proxy playback.`,
    { headers: { "Content-Type": "text/plain" } },
  );
});
