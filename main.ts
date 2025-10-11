// Deno YouTube Extractor + Proxy Streaming
// Usage:
// 1) /ytdl?url=https://youtu.be/xxxx
// 2) /stream?url=YOUTUBE_MEDIA_URL

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return json({ status: "success", message: "🦕 Deno YouTube Extractor Running!" });
  }

  // ---------------- Metadata + Formats ----------------
  if (pathname === "/ytdl") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");

    try {
      const res = await fetch(ytUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();

      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (!playerMatch) return error("Could not parse player JSON");

      const player = JSON.parse(playerMatch[1]);
      const videoDetails = player.videoDetails || {};
      const streamingData = player.streamingData || {};
      const formats = streamingData.formats || [];
      const adaptive = streamingData.adaptiveFormats || [];

      function getUrl(format: any) {
        if (format.url) return format.url;
        const cipher = format.signatureCipher || format.cipher;
        if (!cipher) return null;
        const params = new URLSearchParams(cipher);
        return params.get("url") || null;
      }

      const allFormats = [...formats, ...adaptive].map((f: any) => ({
        itag: f.itag,
        mimeType: f.mimeType,
        qualityLabel: f.qualityLabel || f.audioQuality || "N/A",
        bitrate: f.bitrate || 0,
        audioBitrate: f.audioBitrate || 0,
        url: getUrl(f),
        streamProxy: getUrl(f) ? `/stream?url=${encodeURIComponent(getUrl(f))}` : null
      }));

      return json({
        status: "success",
        title: videoDetails.title || "Unknown",
        videoId: videoDetails.videoId || "",
        author: videoDetails.author || "",
        channelId: videoDetails.channelId || "",
        durationSeconds: parseInt(videoDetails.lengthSeconds || "0", 10),
        thumbnails: videoDetails.thumbnail?.thumbnails || [],
        formats: allFormats,
        audioFormats: allFormats.filter(f => f.mimeType.includes("audio")),
        videoFormats: allFormats.filter(f => f.mimeType.includes("video"))
      });

    } catch (err) {
      return error(err.message);
    }
  }

  // ---------------- Proxy Streaming ----------------
  if (pathname === "/stream") {
    const url = searchParams.get("url");
    if (!url) return error("Missing ?url=");

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept-Encoding": "identity" },
      });
      return new Response(res.body, {
        headers: {
          "content-type": res.headers.get("content-type") || "video/mp4",
          "Cache-Control": "no-cache",
        },
      });
    } catch (err) {
      return error(err.message);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// ----------------- Helper Functions -----------------
function json(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), { headers: { "content-type": "application/json" } });
}

function error(msg: string) {
  return json({ status: "error", message: msg });
}
