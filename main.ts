// deno_ytdl_decipher.ts
// Usage: https://your-deno-deploy-url/ytdl?url=https://youtu.be/FkFvdukWpAI

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return json({
      status: "success",
      message: "🦕 Deno YouTube Auto-Decipher Extractor Running!\nUse /ytdl?url=..."
    });
  }

  if (pathname === "/ytdl") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");

    try {
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

      // Extract the player JS URL
      const jsMatch = html.match(/"jsUrl":"(\/s\/player\/[a-zA-Z0-9\/._-]+\.js)"/);
      if (!jsMatch) return error("Could not find player JS URL");
      const playerJsUrl = `https://www.youtube.com${jsMatch[1]}`;

      // Fetch player JS
      const jsResp = await fetch(playerJsUrl);
      const jsText = await jsResp.text();

      // Minimal signature decipher function extraction
      const decipherFuncNameMatch = jsText.match(/([a-zA-Z0-9$]{2})=function\(a\)\{a=a\.split\(""\);.+?return a\.join\(""\)\}/s);
      let decipher: ((s: string) => string) | null = null;

      if (decipherFuncNameMatch) {
        const funcCode = decipherFuncNameMatch[0];
        // Eval safe: only works on strings and arrays
        decipher = new Function("s", `
          ${funcCode.replace(/a=/g,"let a=")}
          return ${decipherFuncNameMatch[1]}(s);
        `) as (s: string) => string;
      }

      function getUrl(format: any) {
        if (format.url) return format.url;
        const cipher = format.signatureCipher || format.cipher;
        if (!cipher) return null;
        const params = new URLSearchParams(cipher);
        let url = params.get("url");
        const s = params.get("s");
        const sp = params.get("sp") || "signature";
        if (s && url && decipher) {
          url += `&${sp}=${decipher(s)}`;
        }
        return url;
      }

      const allFormats = [...formats, ...adaptive].map((f: any) => ({
        itag: f.itag,
        mimeType: f.mimeType,
        qualityLabel: f.qualityLabel || f.audioQuality || "N/A",
        bitrate: f.bitrate || 0,
        audioBitrate: f.audioBitrate || 0,
        contentLength: f.contentLength || null,
        url: getUrl(f),
      })).filter(f => f.url);

      const audioFormats = allFormats.filter(f => f.mimeType.includes("audio"));
      const videoFormats = allFormats.filter(f => f.mimeType.includes("video"));

      return json({
        status: "success",
        title: videoDetails.title || "Unknown",
        videoId: videoDetails.videoId || "",
        author: videoDetails.author || "",
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
