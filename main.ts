// main.ts
// Deno YouTube Extractor + Fresh URLs
// Example: https://yourapp.deno.dev/ytdl?url=https://youtu.be/FkFvdukWpAI

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return new Response(
      "🦕 Deno YouTube Extractor\nUse /ytdl?url=https://youtu.be/xxxx",
      { headers: { "content-type": "text/plain" } },
    );
  }

  if (pathname === "/ytdl") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");

    try {
      // Fetch YouTube page fresh
      const res = await fetch(ytUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();

      // Extract ytInitialPlayerResponse
      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (!playerMatch) return error("Could not parse ytInitialPlayerResponse");

      const player = JSON.parse(playerMatch[1]);
      const videoDetails = player.videoDetails || {};
      const streamingData = player.streamingData || {};
      const formats = streamingData.formats || [];
      const adaptive = streamingData.adaptiveFormats || [];

      // Decode function for URL (handles signatureCipher)
      function getUrl(format: any) {
        if (!format) return null;
        if (format.url) return format.url;
        const cipher = format.signatureCipher || format.cipher;
        if (!cipher) return null;
        const params = new URLSearchParams(cipher);
        return params.get("url") || null;
      }

      // Pick best audio & video formats
      const audioFormat = adaptive.find((f: any) => f.mimeType.includes("audio"));
      const videoFormat = formats.find((f: any) => f.mimeType.includes("video/mp4"));

      return json({
        status: "success",
        title: videoDetails.title || "Unknown",
        videoId: videoDetails.videoId || "",
        author: videoDetails.author || "",
        channelId: videoDetails.channelId || "",
        publishDate: player.microformat?.playerMicroformatRenderer?.publishDate || "",
        durationSeconds: parseInt(videoDetails.lengthSeconds || "0", 10),
        thumbnails: videoDetails.thumbnail?.thumbnails || [],
        audioUrl: getUrl(audioFormat),
        videoUrl: getUrl(videoFormat),
        formatsCount: formats.length + adaptive.length,
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
