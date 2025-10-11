// main.ts
// Deno Deploy YouTube Metadata API
// Usage: /ytdl?url=https://youtu.be/FkFvdukWpAI

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return new Response(
      "🦕 Deno YouTube Metadata API\nUse /ytdl?url=https://youtu.be/VIDEO_ID",
      { headers: { "content-type": "text/plain" } }
    );
  }

  // ---------------- VIDEO METADATA ----------------
  if (pathname === "/ytdl") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");

    try {
      // Fetch YouTube page
      const res = await fetch(ytUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();

      // Parse ytInitialPlayerResponse
      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (!playerMatch) return error("Could not parse ytInitialPlayerResponse");

      const player = JSON.parse(playerMatch[1]);
      const videoDetails = player.videoDetails || {};
      const streamingData = player.streamingData || {};
      const formats = streamingData.formats || [];
      const adaptive = streamingData.adaptiveFormats || [];

      const microformat = player.microformat?.playerMicroformatRenderer || {};

      // Build metadata object
      const metadata = {
        status: "success",
        title: videoDetails.title || "Unknown",
        videoId: videoDetails.videoId || "",
        author: videoDetails.author || "",
        channelId: videoDetails.channelId || "",
        publishDate: microformat.publishDate || "",
        durationSeconds: parseInt(videoDetails.lengthSeconds || "0", 10),
        thumbnails: videoDetails.thumbnail?.thumbnails || [],
        formatsCount: formats.length + adaptive.length,
        adaptiveFormats: adaptive.map((f: any) => ({
          itag: f.itag,
          mimeType: f.mimeType,
          bitrate: f.bitrate,
          approxDurationMs: f.approxDurationMs,
          qualityLabel: f.qualityLabel || null,
        })),
      };

      return json(metadata);
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
