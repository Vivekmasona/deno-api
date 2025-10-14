// main.ts
// Deno — Resolve & Proxy YouTube streams by itag (fresh URL at stream time)
// Run: deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  const urlObj = new URL(req.url);
  const pathname = urlObj.pathname;

  if (pathname === "/") {
    return text("Deno YouTube proxy\n/formats?url=...  \n/stream?video=...&itag=...");
  }

  if (pathname === "/formats") {
    const video = urlObj.searchParams.get("url");
    if (!video) return jsonError("Missing ?url=");
    try {
      const html = await fetchWatchHtml(video);
      const player = parseInitialPlayerResponse(html);
      if (!player) return jsonError("Could not parse player JSON from watch page");
      const streaming = player.streamingData || {};
      const all = [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])];

      // Return meta + itag list (do not rely on stored googlevideo URLs)
      const list = all.map((f: any) => ({
        itag: f.itag,
        mimeType: f.mimeType || f.mime,
        qualityLabel: f.qualityLabel || f.audioQuality || null,
        bitrate: f.bitrate || null,
        audioBitrate: f.audioBitrate || null,
        contentLength: f.contentLength || null,
        // Note: url field may be absent or time-limited. Use /stream to fetch playable.
        url: f.url || (f.signatureCipher ? "<ciphered>" : null),
      }));

      return json({ status: "success", total: list.length, formats: list });
    } catch (e) {
      return jsonError(String(e));
    }
  }

  if (pathname === "/stream") {
    const video = urlObj.searchParams.get("video");
    const itagParam = urlObj.searchParams.get("itag");
    if (!video || !itagParam) return jsonError("Missing ?video= or &itag=");
    try {
      // Step A: fetch fresh watch page & player JS
      const watchHtml = await fetchWatchHtml(video);
      const player = parseInitialPlayerResponse(watchHtml);
      if (!player) return jsonError("Could not parse player JSON from watch page");

      const streaming = player.streamingData || {};
      const all = [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])];
      const itag = parseInt(itagParam, 10);
      const chosen = all.find((f: any) => Number(f.itag) === itag);
      if (!chosen) return jsonError("itag not found in formats");

      // Step B: build playable URL for chosen format (decipher if needed)
      let finalUrl: string | null = chosen.url || null;
      if (!finalUrl && (chosen.signatureCipher || chosen.cipher)) {
        const cipher = chosen.signatureCipher || chosen.cipher;
        const params = new URLSearchParams(cipher);
        const baseUrl = params.get("url");
        const s = params.get("s");
        const sp = params.get("sp") || "signature";
        const sig = params.get("sig") || params.get("signature") || null;

        if (sig && baseUrl) {
          finalUrl = baseUrl + `&${sp}=${sig}`;
        } else if (s && baseUrl) {
          // Need to decipher 's' using player JS
          const playerJsUrl = extractPlayerJsUrl(watchHtml);
          if (!playerJsUrl) return jsonError("Player JS URL not found; cannot decipher signature");
          const fullPlayerJs = await fetch(absolutify(playerJsUrl, video)).then(r => r.text());
          const tokens = extractSignatureTokens(fullPlayerJs);
          if (!tokens) return jsonError("Could not extract decipher tokens from player JS");
          const decSig = decipherSignature(s, tokens);
          finalUrl = baseUrl + `&${sp}=${encodeURIComponent(decSig)}`;
        } else {
          return jsonError("No usable url/sig found in cipher");
        }
      }

      if (!finalUrl) return jsonError("Failed to produce a playable URL for this itag");

      // Step C: Proxy stream (support Range)
      const range = req.headers.get("range") || undefined;
      const headers: Record<string,string> = {
        "User-Agent": req.headers.get("user-agent") || "Mozilla/5.0",
        "Referer": "https://www.youtube.com/",
      };
      if (range) headers["Range"] = range;

      const upstream = await fetch(finalUrl, { headers });
      if (!upstream.ok) {
        // Provide helpful debug information (not full body)
        const txt = await upstream.text().catch(() => "");
        return jsonError(`Upstream returned ${upstream.status}`, { upstreamStatus: upstream.status, snippet: txt.slice(0,400) });
      }

      // Proxy selected headers + allow CORS
      const respHeaders = new Headers(upstream.headers);
      respHeaders.set("Access-Control-Allow-Origin", "*");
      respHeaders.set("Access-Control-Expose-Headers", "*");

      // Stream body directly
      return new Response(upstream.body, { status: upstream.status, headers: respHeaders });

    } catch (e) {
      return jsonError(String(e));
    }
  }

  return new Response("Not Found", { status: 404 });
});


// ---------- Helper functions ----------

function text(t: string) {
  return new Response(t, { headers: { "content-type": "text/plain" } });
}

function json(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), { headers: { "content-type": "application/json" } });
}

function jsonError(msg: string, extra: any = null) {
  const out: any = { status: "error", message: msg };
  if (extra) out.extra = extra;
  return json(out);
}

async function fetchWatchHtml(videoUrl: string) {
  // Accept either full URL or video id
  const url = videoUrl.startsWith("http") ? videoUrl : `https://www.youtube.com/watch?v=${videoUrl}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  });
  if (!res.ok) throw new Error("Failed to fetch watch page: " + res.status);
  return res.text();
}

function parseInitialPlayerResponse(html: string) {
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function extractPlayerJsUrl(html: string): string | null {
  // common cases
  let m = html.match(/"jsUrl":"([^"]+)"/);
  if (m) return m[1].replace(/\\\//g, "/");
  m = html.match(/src="([^"]*player[^"]*base\.js)"/);
  if (m) return m[1];
  m = html.match(/"PLAYER_JS_URL":"([^"]+)"/);
  if (m) return m[1].replace(/\\\//g, "/");
  m = html.match(/\/s\/player\/[a-zA-Z0-9\/\._-]+\/base\.js/);
  if (m) return m[0];
  // absolute player .js
  m = html.match(/https?:\/\/[^"]+player[-_a-zA-Z0-9\/\.]*\.js/);
  if (m) return m[0];
  return null;
}

function absolutify(urlStr: string, pageUrl: string) {
  if (!urlStr) return urlStr;
  if (/^https?:\/\//i.test(urlStr)) return urlStr;
  if (urlStr.startsWith("//")) return "https:" + urlStr;
  const base = new URL(pageUrl.startsWith("http") ? pageUrl : `https://www.youtube.com/watch?v=${pageUrl}`);
  if (urlStr.startsWith("/")) return `${base.protocol}//${base.host}${urlStr}`;
  return urlStr;
}

/* --- signature token extraction + decipher (best-effort) --- */
/* returns array tokens like ['r','s3','w2'] where:
   r = reverse, sN = slice(N), wN = swap(0,N)
*/
function extractSignatureTokens(js: string): string[] | null {
  // Find function name that is used to decipher signatures
  let fnNameMatch =
    js.match(/\.sig\|\|([a-zA-Z0-9$]+)\(/) ||
    js.match(/signature=([a-zA-Z0-9$]+)\(/) ||
    js.match(/([a-zA-Z0-9$]{2,})=function\(\w\)\{\w=\w\.split\(""\)/);

  if (!fnNameMatch) return null;
  const fnName = fnNameMatch[1];

  // Grab function body
  let fnBodyMatch = js.match(new RegExp(`${escapeRegex(fnName)}=function\\(\\w\\)\\{([\\s\\S]*?)\\}`, "m"));
  if (!fnBodyMatch) {
    fnBodyMatch = js.match(new RegExp(`function\\s+${escapeRegex(fnName)}\\(\\w\\)\\{([\\s\\S]*?)\\}`, "m"));
  }
  if (!fnBodyMatch) return null;
  const fnBody = fnBodyMatch[1];

  // Try to detect helper object used inside
  const helperNameMatch = fnBody.match(/([a-zA-Z0-9$]{2})\.\w+\(\w,(\d+)\)/);
  const helperName = helperNameMatch ? helperNameMatch[1] : null;

  const tokens: string[] = [];

  if (helperName) {
    const helperRegex = new RegExp(`${escapeRegex(helperName)}\\.([a-zA-Z0-9$]{1,})\\(\\w,(\\d+)\\)`, "g");
    let mm;
    while ((mm = helperRegex.exec(fnBody)) !== null) {
      const method = mm[1], num = mm[2];
      // find method definition
      const methodDefRegex = new RegExp(`${escapeRegex(helperName)}\\.${escapeRegex(method)}=function\\([\\w,]+\\)\\{([\\s\\S]*?)\\}`, "m");
      const defMatch = js.match(methodDefRegex);
      const def = defMatch ? defMatch[1] : "";
      if (/reverse\(/.test(def) || /\.reverse\(/.test(def)) tokens.push("r");
      else if (/slice\(/.test(def) || /splice\(/.test(def)) tokens.push("s" + num);
      else tokens.push("w" + num); // swap fallback
    }
  }

  // If tokens empty, search inline
  if (tokens.length === 0) {
    if (fnBody.includes(".reverse(") || fnBody.includes(".reverse()")) tokens.push("r");
    const sliceIter = fnBody.matchAll(/\.slice\((\d+)\)/g);
    for (const m of sliceIter) tokens.push("s" + m[1]);
    const swapMatch = fnBody.match(/\w\[0\]\s*=\s*\w\[\w%(\d+)\]/);
    if (swapMatch) tokens.push("w" + swapMatch[1]);
  }

  return tokens.length ? tokens : null;
}

function decipherSignature(s: string, tokens: string[]) {
  let arr = s.split("");
  for (const t of tokens) {
    if (t === "r") arr = arr.reverse();
    else if (t.startsWith("s")) {
      const n = parseInt(t.slice(1), 10);
      arr = arr.slice(n);
    } else if (t.startsWith("w")) {
      const n = parseInt(t.slice(1), 10);
      const idx = n % arr.length;
      const tmp = arr[0];
      arr[0] = arr[idx];
      arr[idx] = tmp;
    }
  }
  return arr.join("");
}

function escapeRegex(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}
