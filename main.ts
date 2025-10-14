// main.ts — 100% Deno Native YouTube Extractor + Proxy
// Run: deno run --allow-net main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  // Root info
  if (pathname === "/") {
    return json({
      status: "ok",
      message:
        "🦕 Deno YouTube Extractor Running!\nUse /formats?url=... or /stream?url=...",
    });
  }

  // Get all formats
  if (pathname === "/formats") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");

    try {
      const html = await fetch(ytUrl, {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/120 Safari/537.36" },
      }).then((r) => r.text());

      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (!playerMatch) return error("Failed to extract player JSON");

      const player = JSON.parse(playerMatch[1]);
      const streamingData = player.streamingData || {};
      const formats = streamingData.formats || [];
      const adaptiveFormats = streamingData.adaptiveFormats || [];
      const allFormats = [...formats, ...adaptiveFormats];

      // Parse format URLs (signatureCipher included)
      const result = allFormats.map((f: any) => {
        const cipher = f.signatureCipher || f.cipher;
        let url = f.url || null;

        if (cipher) {
          const params = new URLSearchParams(cipher);
          url = params.get("url");
          const sig = params.get("sig") || params.get("signature");
          const sp = params.get("sp");
          if (url && sig && sp) url += `&${sp}=${sig}`;
        }

        return {
          itag: f.itag,
          mimeType: f.mimeType,
          qualityLabel: f.qualityLabel || f.audioQuality || null,
          bitrate: f.bitrate || null,
          audioBitrate: f.audioBitrate || null,
          contentLength: f.contentLength || null,
          url,
        };
      }).filter((f: any) => f.url);

      return json({
        status: "success",
        total: result.length,
        formats: result,
      });
    } catch (err) {
      return error(err.message);
    }
  }

  // Stream proxy (avoid 403)
  if (pathname === "/stream") {
    const target = searchParams.get("url");
    if (!target) return error("Missing ?url=");
    try {
      const resp = await fetch(target, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          "Referer": "https://www.youtube.com/",
          "Origin": "https://www.youtube.com",
          "Range": req.headers.get("Range") || undefined,
        },
      });

      const headers = new Headers(resp.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Expose-Headers", "*");

      return new Response(resp.body, {
        status: resp.status,
        headers,
      });
    } catch (err) {
      return error("Proxy failed: " + err.message);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// -------------------- Helper Functions --------------------
function json(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
function error(msg: string) {
  return json({ status: "error", message: msg });
}
