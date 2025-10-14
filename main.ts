// main.ts
// 🦕 Deno YouTube Extractor with Full itag + Working URLs
// Usage: /ytdl?url=https://youtu.be/FkFvdukWpAI

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return json({
      status: "ok",
      message: "🦕 Deno YouTube Extractor Running",
      usage: "/ytdl?url=https://youtu.be/FkFvdukWpAI"
    });
  }

  if (pathname === "/ytdl") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");

    try {
      const watchHtml = await fetch(ytUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      }).then(r => r.text());

      // Find player script URL
      const jsMatch = watchHtml.match(/"jsUrl":"(\/s\/player\/[a-zA-Z0-9_\-\/\.]+\.js)"/);
      const playerJsUrl = jsMatch ? `https://www.youtube.com${jsMatch[1]}` : null;

      // Extract ytInitialPlayerResponse
      const playerMatch = watchHtml.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (!playerMatch) return error("Could not parse ytInitialPlayerResponse");

      const player = JSON.parse(playerMatch[1]);
      const videoDetails = player.videoDetails || {};
      const streamingData = player.streamingData || {};
      const formats = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];

      // Get decipher function
      let decipherFn: ((sig: string) => string) | null = null;
      if (playerJsUrl) {
        const jsCode = await fetch(playerJsUrl).then(r => r.text());
        decipherFn = extractDecipher(jsCode);
      }

      // Resolve final URLs
      const allFormats = formats.map(f => {
        let url = f.url;
        const cipher = f.signatureCipher || f.cipher;
        let needsDecipher = false;

        if (!url && cipher) {
          const p = new URLSearchParams(cipher);
          url = p.get("url") || "";
          const s = p.get("s");
          const sp = p.get("sp") || "signature";
          if (s && decipherFn) {
            needsDecipher = true;
            const sig = decipherFn(s);
            url += `&${sp}=${sig}`;
          }
        }

        return {
          itag: f.itag,
          mimeType: f.mimeType,
          qualityLabel: f.qualityLabel || f.audioQuality || "N/A",
          bitrate: f.bitrate || 0,
          audioBitrate: f.audioBitrate || 0,
          contentLength: f.contentLength || null,
          url,
          hasAudio: f.audioChannels ? true : f.mimeType?.includes("audio"),
          hasVideo: f.width || f.height ? true : f.mimeType?.includes("video"),
          needsDecipher,
        };
      });

      return json({
        status: "success",
        title: videoDetails.title,
        videoId: videoDetails.videoId,
        author: videoDetails.author,
        durationSeconds: parseInt(videoDetails.lengthSeconds || "0", 10),
        formats: allFormats,
      });
    } catch (err) {
      return error(err.message);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// ----------------- Helper: extract decipher logic -----------------
function extractDecipher(js: string): ((sig: string) => string) | null {
  try {
    const fnNameMatch = js.match(/\.sig\|\|([a-zA-Z0-9$]+)\(/);
    const fnName = fnNameMatch ? fnNameMatch[1] : null;
    if (!fnName) return null;

    const fnBodyMatch = js.match(new RegExp(`${fnName}=function\\(a\\)\\{(.*?)\\}`, "s"));
    const fnBody = fnBodyMatch ? fnBodyMatch[1] : null;
    if (!fnBody) return null;

    // Extract helper object name and functions
    const helperNameMatch = fnBody.match(/([A-Za-z0-9$]{2})\...a/);
    const helperName = helperNameMatch ? helperNameMatch[1] : null;
    const helperBodyMatch = helperName ? js.match(new RegExp(`var ${helperName}=\\{(.*?)\\};`, "s")) : null;
    const helperBody = helperBodyMatch ? helperBodyMatch[1] : null;

    const helper = parseHelper(helperBody);
    const steps = parseSteps(fnBody);

    return (sig: string) => {
      let arr = sig.split("");
      for (const step of steps) {
        if (step.type === "reverse") arr.reverse();
        else if (step.type === "swap") {
          const pos = step.arg % arr.length;
          [arr[0], arr[pos]] = [arr[pos], arr[0]];
        } else if (step.type === "slice") arr = arr.slice(step.arg);
      }
      return arr.join("");
    };
  } catch {
    return null;
  }
}

// Helpers for decipher extraction
function parseHelper(body: string | null) {
  if (!body) return {};
  const map: any = {};
  const fnDefs = body.split("},");
  for (const def of fnDefs) {
    const [name, code] = def.split(":{");
    if (code.includes("reverse")) map[name.trim()] = "reverse";
    else if (code.includes("splice")) map[name.trim()] = "slice";
    else if (code.includes("var c=")) map[name.trim()] = "swap";
  }
  return map;
}

function parseSteps(body: string) {
  const calls = body.split(";");
  const steps: any[] = [];
  for (const c of calls) {
    if (c.includes(".reverse(")) steps.push({ type: "reverse" });
    const swapMatch = c.match(/\.([A-Za-z0-9$]{2})\(a,(\d+)\)/);
    if (swapMatch) steps.push({ type: "swap", arg: parseInt(swapMatch[2], 10) });
    const sliceMatch = c.match(/\.([A-Za-z0-9$]{2})\(a,(\d+)\)/);
    if (sliceMatch) steps.push({ type: "slice", arg: parseInt(sliceMatch[2], 10) });
  }
  return steps;
}

// ----------------- Helper: JSON + Error -----------------
function json(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
function error(msg: string) {
  return json({ status: "error", message: msg });
}
