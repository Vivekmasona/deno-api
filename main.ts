import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return json({ status: "success", message: "Deno YouTube Extractor Running" });
  }

  if (pathname === "/ytdl") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");

    try {
      // Fetch video page
      const html = await (await fetch(ytUrl, { headers: { "User-Agent": "Mozilla/5.0" } })).text();

      // Extract ytInitialPlayerResponse
      const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (!match) return error("Cannot parse player JSON");
      const player = JSON.parse(match[1]);
      const videoDetails = player.videoDetails || {};
      const streamingData = player.streamingData || {};
      const formats = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];

      // Extract player JS URL for decipher
      const jsUrlMatch = html.match(/"jsUrl":"(\/s\/player\/[\w\d\/\.\-_]+\.js)"/);
      if (!jsUrlMatch) return error("Cannot find player JS URL");
      const jsUrl = "https://www.youtube.com" + jsUrlMatch[1];
      const playerJs = await (await fetch(jsUrl)).text();

      // Simple decipher function extractor
      const decipher = getDecipherFunction(playerJs);

      // Map formats with deciphered URLs
      const allFormats = formats.map((f: any) => {
        if (f.url) return f; // Already usable
        const cipher = f.signatureCipher || f.cipher;
        if (!cipher) return f;

        const params = new URLSearchParams(cipher);
        const url = params.get("url")!;
        const s = params.get("s");
        const sp = params.get("sp") || "signature";
        const sig = s ? decipher(s) : params.get("sig");

        return {
          ...f,
          url: sig ? `${url}&${sp}=${sig}` : url
        };
      });

      return json({
        status: "success",
        title: videoDetails.title,
        videoId: videoDetails.videoId,
        author: videoDetails.author,
        formats: allFormats
      });

    } catch (e) {
      return error(String(e));
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

// ----------------- Decipher Logic -----------------
// Parses the player JS and returns a function to decipher 's'
// Implement a real parser here. For demo, simple identity function
function getDecipherFunction(jsCode: string) {
  // TODO: parse the cipher function from jsCode
  return (s: string) => {
    // Real decipher logic goes here
    return s; // placeholder - currently returns original (won’t work)
  };
}
