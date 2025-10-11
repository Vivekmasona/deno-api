// Deno YouTube Extractor + All Formats
// Usage: /ytdl?url=https://youtu.be/FkFvdukWpAI

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return json({
      status: "success",
      message: "🦕 Deno YouTube Extractor Running!\nUse /ytdl?url=..."
    });
  }

  if (pathname === "/ytdl") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");

    try {
      // Fetch YouTube page
      const res = await fetch(ytUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();

      // Extract ytInitialPlayerResponse
      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (!playerMatch) return error("Could not parse player JSON");

      const player = JSON.parse(playerMatch[1]);
      const videoDetails = player.videoDetails || {};
      const streamingData = player.streamingData || {};
      const formats = streamingData.formats || [];
      const adaptive = streamingData.adaptiveFormats || [];

      // Decode URL helper
      function getUrl(format: any) {
        if (format.url) return format.url;
        const cipher = format.signatureCipher || format.cipher;
        if (!cipher) return null;
        const params = new URLSearchParams(cipher);
        return params.get("url") || null;
      }

      // Combine all formats
      const allFormats = [...formats, ...adaptive].map((f: any) => ({
        itag: f.itag,
        mimeType: f.mimeType,
        qualityLabel: f.qualityLabel || f.audioQuality || "N/A",
        bitrate: f.bitrate || 0,
        audioBitrate: f.audioBitrate || 0,
        url: getUrl(f),
      }));

      // Separate audio-only and video-only
      const audioFormats = allFormats.filter(f => f.mimeType.includes("audio"));
      const videoFormats = allFormats.filter(f => f.mimeType.includes("video"));

      return json({
        status: "success",
        title: videoDetails.title || "Unknown",
        videoId: videoDetails.videoId || "",
        author: videoDetails.author || "",
        channelId: videoDetails.channelId || "",
        durationSeconds: parseInt(videoDetails.lengthSeconds || "0", 10),
        thumbnails: videoDetails.thumbnail?.thumbnails || [],
        formats: allFormats,
        audioFormats,
        videoFormats,
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
