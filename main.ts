// deno_ytdl_stream.ts
// Usage: https://your-deno-deploy-url/stream?url=https://youtu.be/FkFvdukWpAI

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return new Response("🦕 Deno YouTube Streamer Running! Use /stream?url=...");
  }

  if (pathname === "/stream") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url= parameter");

    try {
      // Fetch YouTube page
      const html = await fetchPage(ytUrl);

      // Extract player JSON
      const playerJson = extractPlayerJSON(html);
      if (!playerJson) return error("Could not extract player JSON");

      const formats = [...(playerJson.streamingData?.formats || []), ...(playerJson.streamingData?.adaptiveFormats || [])];
      if (!formats.length) return error("No formats found");

      // Choose a playable format (video+audio or audio)
      const format = formats.find(f => f.itag === 18) || formats[0];

      // Get playable URL
      const streamUrl = await getPlayableUrl(format, html);

      if (!streamUrl) return error("Could not generate playable URL");

      return Response.redirect(streamUrl, 302);

    } catch (err) {
      return error(err.message);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// ----------------- Helpers -----------------
async function fetchPage(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  return await res.text();
}

function extractPlayerJSON(html: string) {
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  if (!match) return null;
  return JSON.parse(match[1]);
}

async function getPlayableUrl(format: any, html: string) {
  if (format.url) return format.url;

  const cipher = format.signatureCipher || format.cipher;
  if (!cipher) return null;

  const params = new URLSearchParams(cipher);
  let url = params.get("url");
  const s = params.get("s");
  const sp = params.get("sp") || "signature";

  if (s && url) {
    // Extract player JS
    const jsMatch = html.match(/"jsUrl":"(\/s\/player\/[a-zA-Z0-9\/._-]+\.js)"/);
    if (!jsMatch) return null;
    const playerJsUrl = `https://www.youtube.com${jsMatch[1]}`;

    const jsText = await (await fetch(playerJsUrl)).text();
    const decipherFuncNameMatch = jsText.match(/([a-zA-Z0-9$]{2})=function\(a\)\{a=a\.split\(""\);.+?return a\.join\(""\)\}/s);

    if (!decipherFuncNameMatch) return null;

    const funcCode = decipherFuncNameMatch[0];
    const decipher = new Function("s", `
      ${funcCode.replace(/a=/g,"let a=")}
      return ${decipherFuncNameMatch[1]}(s);
    `) as (s: string) => string;

    url += `&${sp}=${decipher(s)}`;
  }

  return url;
}

function error(msg: string) {
  return new Response(JSON.stringify({ status: "error", message: msg }, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
