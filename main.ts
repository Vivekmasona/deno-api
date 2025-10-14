// Deno YouTube Opus Audio Extractor
// Usage: http://localhost:8000/ytdl-opus?url=https://youtu.be/FkFvdukWpAI

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return json({ status: "success", message: "Deno YouTube Opus Extractor Running" });
  }

  if (pathname === "/ytdl-opus") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");

    try {
      const html = await (await fetch(ytUrl, { headers: { "User-Agent": "Mozilla/5.0" } })).text();

      // Parse player JSON
      const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (!match) return error("Cannot parse player JSON");

      const player = JSON.parse(match[1]);
      const videoDetails = player.videoDetails || {};
      const adaptive = player.streamingData?.adaptiveFormats || [];

      // Extract player JS URL
      const jsUrlMatch = html.match(/"jsUrl":"(\/s\/player\/[\w\d\/\.\-_]+\.js)"/);
      if (!jsUrlMatch) return error("Cannot find player JS URL");

      const jsUrl = "https://www.youtube.com" + jsUrlMatch[1];
      const playerJs = await (await fetch(jsUrl)).text();

      // Create decipher function
      const decipher = createDecipher(playerJs);

      // Filter Opus audio formats and decipher
      const opusFormats = adaptive
        .filter((f: any) => f.mimeType?.includes("audio/webm") && f.mimeType?.includes("opus"))
        .map((f: any) => {
          if (f.url) return f; // Already has working URL
          const cipher = f.signatureCipher || f.cipher;
          if (!cipher) return f;

          const params = new URLSearchParams(cipher);
          const url = params.get("url")!;
          const s = params.get("s");
          const sp = params.get("sp") || "signature";
          const sig = s ? decipher(s) : params.get("sig");

          return { ...f, url: sig ? `${url}&${sp}=${sig}` : url };
        });

      return json({
        status: "success",
        title: videoDetails.title,
        videoId: videoDetails.videoId,
        author: videoDetails.author,
        opusFormats,
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

// ----------------- YouTube Signature Decipher -----------------
function createDecipher(jsCode: string) {
  // Extract the main cipher function name
  const fnNameMatch = jsCode.match(/\.sig\|\|([a-zA-Z0-9$]+)\(/);
  if (!fnNameMatch) return (s: string) => s;

  const fnName = fnNameMatch[1].replace(/\$/g, "\\$");

  // Extract function body
  const fnBodyMatch = jsCode.match(new RegExp(`${fnName}=function\\(a\\)\\{(.*?)\\}`, "s"));
  if (!fnBodyMatch) return (s: string) => s;

  const fnBody = fnBodyMatch[1];

  // Extract helper object name
  const helperNameMatch = fnBody.match(/;([a-zA-Z0-9$]{2})\./);
  if (!helperNameMatch) return (s: string) => s;
  const helperName = helperNameMatch[1].replace(/\$/g, "\\$");

  // Extract helper object body
  const helperBodyMatch = jsCode.match(new RegExp(`var ${helperName}=\\{(.*?)\\};`, "s"));
  if (!helperBodyMatch) return (s: string) => s;
  const helperBody = helperBodyMatch[1];

  // Simple parser: handle common ops (reverse, slice, swap)
  return function decipher(sig: string): string {
    let a = sig.split("");

    // Example: parse operations
    // This is minimal and works for common current YouTube player JS
    const ops = fnBody.split(";").filter(l => l.includes(helperName + "."));
    for (const op of ops) {
      if (op.includes("reverse")) a = a.reverse();
      else if (op.includes("splice")) {
        const nMatch = op.match(/splice\((\d+)\)/);
        if (nMatch) a.splice(0, parseInt(nMatch[1], 10));
      } else if (op.includes("swap")) {
        const nMatch = op.match(/(\w+)\[0\]=\w+\[(\d+)\]/);
        if (nMatch) {
          const i = parseInt(nMatch[2], 10);
          const tmp = a[0];
          a[0] = a[i];
          a[i] = tmp;
        }
      }
    }
    return a.join("");
  };
}
