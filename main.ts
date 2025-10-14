// main.ts — Deno version (no npm, fully native)
// Run with: deno run --allow-net --allow-env main.ts
// Example:
//   1️⃣ Get all formats:   https://yourdomain.com/formats?url=https://youtu.be/FkFvdukWpAI
//   2️⃣ Stream proxy:      https://yourdomain.com/stream?url=<encoded_googlevideo_url>

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

async function getYouTubeFormats(videoUrl: string) {
  const api = `https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${extractVideoId(videoUrl)}`;
  const headers = {
    "X-RapidAPI-Key": "f2e9e4d8a9msh98b3a55d5fb9c23p19d845jsn5e9bdf27b507", // <-- demo key, replace with your own if needed
    "X-RapidAPI-Host": "ytstream-download-youtube-videos.p.rapidapi.com",
  };

  const res = await fetch(api, { headers });
  if (!res.ok) throw new Error("Failed to fetch formats");
  const data = await res.json();

  // Combine all formats
  const allFormats = [
    ...(data.formats || []),
    ...(data.adaptiveFormats || []),
  ];

  return allFormats.map((f: any) => ({
    itag: f.itag,
    qualityLabel: f.qualityLabel || null,
    mimeType: f.mimeType,
    bitrate: f.bitrate,
    audioBitrate: f.audioBitrate || null,
    contentLength: f.contentLength,
    url: f.url,
  }));
}

function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : url;
}

async function handleStream(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  if (!target) return new Response("Missing ?url", { status: 400 });

  // Proxy request to bypass 403
  const ytRes = await fetch(target, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Referer": "https://www.youtube.com/",
      "Origin": "https://www.youtube.com",
      "Range": req.headers.get("Range") || undefined,
    },
  });

  if (!ytRes.ok) {
    return new Response("Upstream fetch failed", { status: ytRes.status });
  }

  const headers = new Headers(ytRes.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "*");

  return new Response(ytRes.body, {
    status: ytRes.status,
    headers,
  });
}

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/formats") {
    const url = searchParams.get("url");
    if (!url) return new Response("Missing ?url", { status: 400 });

    try {
      const formats = await getYouTubeFormats(url);
      return new Response(JSON.stringify({ videoFormats: formats }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (pathname === "/stream") {
    return handleStream(req);
  }

  return new Response(
    `✅ Deno YouTube API running!
Use /formats?url=... to list formats
Use /stream?url=... to proxy stream`,
    { headers: { "Content-Type": "text/plain" } },
  );
});
