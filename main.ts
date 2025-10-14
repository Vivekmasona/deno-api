// main.ts
// Deno Deploy compatible YouTube formats extractor
// Run: deno deploy or deno run --allow-net main.ts

Deno.serve(async (req) => {
  const urlObj = new URL(req.url);
  const pathname = urlObj.pathname;

  if (pathname === "/") {
    return text("Deno YouTube Extractor\n/formats?url=...");
  }

  if (pathname === "/formats") {
    const videoUrl = urlObj.searchParams.get("url");
    if (!videoUrl) return jsonError("Missing ?url=");

    try {
      // Fetch YouTube page
      const res = await fetch(videoUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();

      // Extract player JSON
      const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (!match) return jsonError("Could not extract player JSON");

      const player = JSON.parse(match[1]);
      const videoDetails = player.videoDetails || {};
      const streamingData = player.streamingData || {};
      const formats = streamingData.formats || [];
      const adaptive = streamingData.adaptiveFormats || [];

      // Decode cipher URLs
      function getUrl(f: any) {
        if (f.url) return f.url;
        const cipher = f.signatureCipher || f.cipher;
        if (!cipher) return null;
        const params = new URLSearchParams(cipher);
        return params.get("url") || null;
      }

      const allFormats = [...formats, ...adaptive].map((f: any) => ({
        itag: f.itag,
        mimeType: f.mimeType,
        qualityLabel: f.qualityLabel || f.audioQuality || "N/A",
        bitrate: f.bitrate || 0,
        audioBitrate: f.audioBitrate || null,
        contentLength: f.contentLength || null,
        url: getUrl(f),
      }));

      const audioFormats = allFormats.filter(f => f.mimeType?.includes("audio"));
      const videoFormats = allFormats.filter(f => f.mimeType?.includes("video"));

      return json({
        status: "success",
        title: videoDetails.title || "Unknown",
        videoId: videoDetails.videoId || "",
        author: videoDetails.author || "",
        channelId: videoDetails.channelId || "",
        durationSeconds: parseInt(videoDetails.lengthSeconds || "0", 10),
        thumbnails: videoDetails.thumbnail?.thumbnails || [],
        total: allFormats.length,
        formats: allFormats,
        audioFormats,
        videoFormats,
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
