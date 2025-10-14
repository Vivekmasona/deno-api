// main.ts
// Deno + yt-dlp YouTube Extractor & Streamer
// Run: deno run --allow-net --allow-run main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  const urlObj = new URL(req.url);
  const pathname = urlObj.pathname;

  if (pathname === "/") {
    return text("Deno YouTube Server\n/formats?url=...\n/stream?video=...&itag=...");
  }

  if (pathname === "/formats") {
    const video = urlObj.searchParams.get("url");
    if (!video) return jsonError("Missing ?url=");
    try {
      // Call yt-dlp to get formats as JSON
      const process = Deno.run({
        cmd: ["yt-dlp", "-J", video],
        stdout: "piped",
        stderr: "piped",
      });

      const output = await process.output();
      const decoder = new TextDecoder();
      const jsonStr = decoder.decode(output);

      await process.status(); // wait exit
      return new Response(jsonStr, { headers: { "content-type": "application/json" } });
    } catch (e) {
      return jsonError(String(e));
    }
  }

  if (pathname === "/stream") {
    const video = urlObj.searchParams.get("video");
    const itag = urlObj.searchParams.get("itag");
    if (!video || !itag) return jsonError("Missing ?video= or &itag=");
    try {
      // Range headers support
      const range = req.headers.get("range");
      const headers: HeadersInit = { "User-Agent": "Mozilla/5.0" };
      if (range) headers["Range"] = range;

      // yt-dlp stream to stdout
      const process = Deno.run({
        cmd: ["yt-dlp", "-f", itag, "-o", "-", video],
        stdout: "piped",
        stderr: "piped",
      });

      // Return streamed response
      return new Response(process.stdout, {
        headers: {
          "content-type": "video/mp4", // generic, yt-dlp sends correct content
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "*",
        },
      });

    } catch (e) {
      return jsonError(String(e));
    }
  }

  return new Response("Not Found", { status: 404 });
});

function text(t: string) {
  return new Response(t, { headers: { "content-type": "text/plain" } });
}

function jsonError(msg: string) {
  return new Response(JSON.stringify({ status: "error", message: msg }, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
