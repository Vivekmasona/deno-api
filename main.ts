// main.ts
// Deno + yt-dlp Hybrid YouTube API
// Usage:
// /ytdl?url=https://youtu.be/FkFvdukWpAI

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return new Response(
      "🦕 Deno + yt-dlp YouTube API\nUse /ytdl?url=https://youtu.be/VIDEO_ID",
      { headers: { "content-type": "text/plain" } }
    );
  }

  if (pathname === "/ytdl") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");

    try {
      // Run yt-dlp to get JSON metadata + URLs
      const process = Deno.run({
        cmd: ["yt-dlp", "-j", ytUrl],
        stdout: "piped",
        stderr: "piped",
      });

      const output = await process.output();
      const status = await process.status();
      process.close();

      if (!status.success) return error("yt-dlp failed");

      const info = JSON.parse(new TextDecoder().decode(output));

      // Extract best audio + video URLs
      const bestAudio = info.formats?.find((f: any) => f.acodec !== "none" && f.vcodec === "none");
      const bestVideo = info.formats?.find((f: any) => f.vcodec !== "none" && f.acodec !== "none");

      return json({
        status: "success",
        title: info.title,
        videoId: info.id,
        channel: info.uploader,
        publishDate: info.upload_date,
        durationSeconds: info.duration,
        thumbnails: info.thumbnails || [],
        audioUrl: bestAudio?.url || null,
        videoUrl: bestVideo?.url || null,
        formatsCount: info.formats?.length || 0,
      });
    } catch (err) {
      return error(err.message);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// ----------------- Helper Functions -----------------
function json(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" },
  });
}

function error(msg: string) {
  return json({ status: "error", message: msg });
}
