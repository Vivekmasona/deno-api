// Deno YouTube extractor - improved parsing of signatureCipher/cipher
// Usage: /ytdl?url=https://youtu.be/FkFvdukWpAI
// NOTE: This returns parsed cipher fields. If a format has `needsDecipher: true`
// you must implement the signature decipher (fetch player JS and apply algorithm)
// or use an external library/server (ytdl-core, yt-dlp, etc).

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
      // fetch the video page
      const res = await fetch(ytUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();

      // Try to find the ytInitialPlayerResponse JSON
      // Note: youtube sometimes wraps differently; this regex covers common case
      const playerMatch =
        html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s) ||
        html.match(/window\["ytInitialPlayerResponse"\]\s*=\s*(\{.+?\});/s);

      if (!playerMatch) return error("Could not parse player JSON");

      const player = JSON.parse(playerMatch[1]);
      const videoDetails = player.videoDetails || {};
      const streamingData = player.streamingData || {};
      const formats = streamingData.formats || [];
      const adaptive = streamingData.adaptiveFormats || [];

      // Helper: parse signatureCipher / cipher string into object
      function parseCipher(cipherStr: string | undefined) {
        if (!cipherStr) return null;
        // some entries use "signatureCipher" or "cipher" and are URL-encoded params
        try {
          const params = new URLSearchParams(cipherStr);
          const obj: Record<string, string> = {};
          for (const [k, v] of params.entries()) obj[k] = v;
          return obj;
        } catch (e) {
          return null;
        }
      }

      // Build combined formats with parsed cipher info, and flag which need decipher
      const allRaw = [...formats, ...adaptive];
      const allFormats = allRaw.map((f: any) => {
        const cipher = parseCipher(f.signatureCipher || f.cipher);
        const directUrl = f.url || (cipher && cipher.url) || null;
        // A format needs decipher if it has an 's' param (obfuscated signature)
        const needsDecipher = !!(cipher && cipher.s);
        // If there's a 'sig' or 'sig' style param we can append it to url
        const hasSig = !!(cipher && (cipher.sig || cipher.s || cipher.signature));

        // Build an informative object to return
        const out: any = {
          itag: f.itag,
          mimeType: f.mimeType || f.mime,
          qualityLabel: f.qualityLabel || f.audioQuality || "N/A",
          bitrate: f.bitrate || null,
          audioBitrate: f.audioBitrate || null,
          contentLength: f.contentLength || null,
          // directUrl will be null when signature needs deciphering
          url: directUrl,
          parsedCipher: cipher,        // parsed query params from signatureCipher/cipher
          needsDecipher,
          hasSig,
        };

        return out;
      });

      // Separate audio-only and video-only using mimeType when present
      const audioFormats = allFormats.filter((f: any) => f.mimeType && f.mimeType.includes("audio"));
      const videoFormats = allFormats.filter((f: any) => f.mimeType && f.mimeType.includes("video"));

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
        note:
          "Formats with needsDecipher=true contain an obfuscated signature (s). To get a working URL you must fetch the player JS and run the decipher algorithm on the 's' value, or use a backend tool (ytdl-core / yt-dlp) that already implements this.",
      });

    } catch (err) {
      return error(String(err?.message || err));
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
