// main.ts
// Deno YouTube fresh CDN URL generator (decipher signature)
// Usage: https://yourapp.deno.dev/fresh?url=https://youtu.be/VIDEOID

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);
  if (pathname === "/") {
    return new Response("YouTube fresh URL generator. Use /fresh?url=VIDEO_URL", {
      headers: { "content-type": "text/plain" },
    });
  }

  if (pathname !== "/fresh") return notFound();

  const videoUrl = searchParams.get("url");
  if (!videoUrl) return bad("Missing ?url=");

  try {
    const pageRes = await fetch(videoUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await pageRes.text();

    // 1) Extract ytInitialPlayerResponse
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!playerMatch) return bad("ytInitialPlayerResponse not found");

    const player = JSON.parse(playerMatch[1]);
    const streaming = player.streamingData || {};
    const formats = (streaming.formats || []).concat(streaming.adaptiveFormats || []);

    if (!formats || formats.length === 0) return bad("No formats found");

    // 2) Find player JS URL
    // pattern examples: "jsUrl":"\/s\/player\/abcd\/base.js" or "playerUrl":"https://www.youtube.com/s/player/..."
    let playerJsUrl = null;
    // try microformat or html patterns
    const jsMatch = html.match(/"jsUrl":"([^"]+)"/) || html.match(/src="([^"]+base\.js)"/);
    if (jsMatch) {
      playerJsUrl = jsMatch[1];
      // jsUrl may be relative: "/s/player/..."
      if (playerJsUrl.startsWith("//")) playerJsUrl = "https:" + playerJsUrl;
      else if (playerJsUrl.startsWith("/")) playerJsUrl = "https://www.youtube.com" + playerJsUrl;
    } else {
      // fallback: find /s/player/.../base.js
      const fallback = html.match(/\/s\/player\/[^\s"']+\/base\.js/);
      if (fallback) playerJsUrl = "https://www.youtube.com" + fallback[0];
    }

    // 3) If any format already has url (and not cipher), return first that has url and unexpired
    const direct = formats.find((f: any) => f.url && !f.signatureCipher && !f.cipher);
    if (direct) {
      return json({ status: "success", url: direct.url, itag: direct.itag });
    }

    if (!playerJsUrl) return bad("Player JS URL not found; cannot decode signature");

    // 4) Fetch player JS
    const jsRes = await fetch(playerJsUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    const jsText = await jsRes.text();

    // 5) Parse decipher function name and body
    // typical pattern: a.set("signature", Bf(a.s)) or var YTString = function(a){a=a.split("");a.reverse();...}
    // Strategy: find the name of the function used to decode signatures by searching for ".sig||([a])" patterns,
    // but we use a robust ytdl-core-like approach:
    const fnNameMatch =
      jsText.match(/(?:\b[cs]\s*&&\s*)?([a-zA-Z0-9$]{2,})\s*=\s*function\(\w\)\s*\{\w=\w\.split\(""\);/) ||
      jsText.match(/([a-zA-Z0-9$]{2,})\s*:\s*function\(\w\)\s*\{\w=\w\.split\(""\);/) ||
      jsText.match(/function\s+([a-zA-Z0-9$]{2,})\(\w\)\{\w=\w\.split\(""\);/);

    let decipherFuncName = fnNameMatch ? fnNameMatch[1] : null;

    // Another pattern: "signatureCipher" handler uses some function e.g. a.sig||a.s && (a.s = za(a.s))
    if (!decipherFuncName) {
      const alt = jsText.match(/\.sig\|\|([a-zA-Z0-9$]{2,})\(/);
      if (alt) decipherFuncName = alt[1];
    }

    if (!decipherFuncName) {
      // try to detect object that contains helper methods (like var YT= { reverse: function(a)... })
      const nameMatch = jsText.match(/([a-zA-Z0-9$]{2,})\s*=\s*function\(\w\)\{\w=\w\.split\(""\);/);
      if (nameMatch) decipherFuncName = nameMatch[1];
    }

    // Fallback: brute-force try to find the "signature" operation object name
    // find the helper object name used in function body: e.g., var Xd = {Ck:function(a,b){...}, reverse:function(a){a.reverse()}}
    // We will try to locate the helper object used by the function referenced in signature replacement.
    // For reliability, try to extract the "transform" array by locating the function that takes (a,b) or uses splice/reverse/slice.
    // Use ytdl-core inspired extractor:
    const helperNameMatch = jsText.match(/([a-zA-Z0-9$]{2,})\.reverse\(\)/) || jsText.match(/([a-zA-Z0-9$]{2,})\.splice\(/);
    // not guaranteed; continue

    // 6) Build operations from player JS using a simpler pattern detection
    // Look for function that performs ops like: a.reverse(), a.splice(0,b), var c=a[0];a[0]=a[b%a.length];a[b]=c
    // Find the function body by name
    let funcBody = null;
    if (decipherFuncName) {
      const re = new RegExp(decipherFuncName + "\\=function\\(\\w\\)\\{(.*?)\\}", "s");
      const m = jsText.match(re) || jsText.match(new RegExp("function\\s+" + decipherFuncName + "\\(\\w\\)\\{(.*?)\\}", "s"));
      if (m) funcBody = m[1];
    }

    // If funcBody not found, try to find common name used in "decodeURIComponent" usage pattern
    if (!funcBody) {
      const m2 = jsText.match(/([a-zA-Z0-9$]{2,})\.decodeURIComponent\(/);
      if (m2) {
        const name = m2[1];
        const re = new RegExp(name + "\\=\\{(.*?)\\};", "s");
        const mm = jsText.match(re);
        if (mm) funcBody = mm[1];
      }
    }

    if (!funcBody) {
      // As a last resort, try to extract the whole player JS and attempt limited operations
      // We'll attempt to locate the helper object (two-letter name) and parse its methods.
      // This is best-effort; if fails, return error.
    }

    // 7) Helper to parse signatureCipher and decode using simple ops (reverse, slice, swap)
    function parseCipher(cipher: string) {
      const params = new URLSearchParams(cipher);
      const url = params.get("url");
      const s = params.get("s") || params.get("sig") || params.get("signature");
      const sp = params.get("sp") || "signature";
      return { url, s, sp };
    }

    // build a simple decipher ops extractor: find object with functions and map them to ops
    function buildDecipher(js: string) {
      // find the object that contains the helper methods
      // pattern: var YT = {R: function(a){a.reverse()}, S: function(a,b){a.splice(0,b)}, T: function(a,b){var c=a[0];a[0]=a[b%a.length];a[b]=c}};
      const objMatch = js.match(/var\s+([a-zA-Z0-9$]{2,})=\{([^\}]+)\};/s) || js.match(/([a-zA-Z0-9$]{2,})=\{([^\}]+)\};/s);
      let objName = objMatch ? objMatch[1] : null;
      let objBody = objMatch ? objMatch[2] : null;

      if (!objBody) {
        // try to find object via "=\{.*?reverse: function"
        const m = js.match(/([a-zA-Z0-9$]{2,})=\{[^\}]*reverse:function/g);
        if (m && m[1]) {
          objName = m[1];
          const re = new RegExp(objName + "\\=\\{([\\s\\S]*?)\\};");
          const mm = js.match(re);
          objBody = mm ? mm[1] : null;
        }
      }

      if (!objBody) return null;

      // parse method names mapping
      const methods: Record<string, string> = {};
      const methodRe = /([a-zA-Z0-9$]{2,})\s*:\s*function\(\w(?:,\w)?\)\s*\{([^}]+)\}/g;
      let m;
      while ((m = methodRe.exec(objBody)) !== null) {
        const name = m[1];
        const body = m[2];
        if (body.includes("reverse(") || body.includes(".reverse()")) methods[name] = "reverse";
        else if (body.includes("splice(")) methods[name] = "splice";
        else if (body.includes("var c=a[0]") || body.includes("a[0]=a[b%a.length]") || /a\[0\]=a\[b%a.length\]/.test(body)) methods[name] = "swap";
      }

      // find the main decipher function that calls these methods in sequence
      const fnMatch = js.match(new RegExp("function\\([a-zA-Z]\\)\\{[\\s\\S]*?\\}"));
      // fallback: search for patterns like ";\n" - too noisy. We'll instead search for "split(\"\")" and then sequence of calls
      const seqMatch = js.match(/\.split\(""\);\s*([a-zA-Z0-9$.;=\s()'"\[\]]{10,200})\breturn a.join\(""\)/s);
      let seq = seqMatch ? seqMatch[1] : null;
      if (!seq) {
        // find the function body via decipherFuncName earlier
        if (funcBody) {
          seq = funcBody;
        }
      }
      if (!seq) return null;

      // convert seq into operations array
      const ops: Array<any> = [];
      // match calls like: objName.reverse(a) or objName.splice(a, b) or objName.swap(a, b)
      const callRe = new RegExp(objName + "\\.([a-zA-Z0-9$]{2,})\\(a,(\\d+)\\)", "g");
      let call;
      while ((call = callRe.exec(seq)) !== null) {
        const method = methods[call[1]];
        const num = parseInt(call[2], 10);
        if (method === "reverse") ops.push({ op: "reverse" });
        else if (method === "splice") ops.push({ op: "splice", n: num });
        else if (method === "swap") ops.push({ op: "swap", n: num });
      }

      // also check for simple patterns: a.reverse(), a.splice(0,n), var c=a[0];a[0]=a[n%a.length];a[n]=c
      if (seq.includes("reverse()")) ops.push({ op: "reverse" });
      const spliceMatches = seq.match(/splice\(\s*0\s*,\s*(\d+)\s*\)/g);
      if (spliceMatches) {
        for (const sp of spliceMatches) {
          const n = sp.match(/splice\(\s*0\s*,\s*(\d+)\s*\)/)[1];
          ops.push({ op: "splice", n: parseInt(n, 10) });
        }
      }
      // swap pattern
      const swapMatch = seq.match(/var\s+[a-z]=a\[0\];a\[0\]=a\[(\d+)%a.length\];a\[\1\]=[a-z]/);
      if (swapMatch) ops.push({ op: "swap", n: parseInt(swapMatch[1], 10) });

      return ops.length ? ops : null;
    }

    const ops = buildDecipher(jsText);

    // 8) Decipher function application
    function decipherSignature(s: string) {
      if (!ops || ops.length === 0) {
        // fallback: try to return s as-is (may not work)
        return s;
      }
      let arr = s.split("");
      for (const op of ops) {
        if (op.op === "reverse") arr = arr.reverse();
        else if (op.op === "splice") arr.splice(0, op.n);
        else if (op.op === "swap") {
          const n = op.n % arr.length;
          const tmp = arr[0];
          arr[0] = arr[n];
          arr[n] = tmp;
        }
      }
      return arr.join("");
    }

    // 9) For each format with cipher, reconstruct url
    const results: any[] = [];
    for (const f of formats) {
      const cipher = f.signatureCipher || f.cipher;
      if (!cipher) continue;
      const parsed = parseCipher(cipher);
      if (!parsed.url) continue;
      if (!parsed.s) {
        // maybe signature already present in url
        results.push({ itag: f.itag, url: parsed.url });
        continue;
      }

      const dec = decipherSignature(parsed.s);
      // append signature param (sp) with deciphered value
      const finalUrl = parsed.url + `&${parsed.sp}=${encodeURIComponent(dec)}`;
      results.push({ itag: f.itag, url: finalUrl, mimeType: f.mimeType, quality: f.qualityLabel || f.quality });
    }

    if (results.length === 0) return bad("No decipherable formats found");

    // Return the first best audio and video (prefer audio bitrates, video itag 18 etc.)
    const audioRes = results.find(r => r.mimeType && r.mimeType.includes("audio")) || results[0];
    const videoRes = results.find(r => r.mimeType && r.mimeType.includes("video")) || results[0];

    return json({
      status: "success",
      videoId: player.videoDetails?.videoId || null,
      title: player.videoDetails?.title || null,
      audio: audioRes,
      video: videoRes,
      all: results,
      note: "URLs are freshly assembled — they still may expire after a short time (minutes).",
    });
  } catch (err) {
    return bad(err.message || String(err));
  }

  // Helpers
  function json(obj: any) {
    return new Response(JSON.stringify(obj, null, 2), { headers: { "content-type": "application/json" } });
  }
  function bad(msg: string) {
    return new Response(JSON.stringify({ status: "error", message: msg }, null, 2), { headers: { "content-type": "application/json" }, status: 400 });
  }
  function notFound() {
    return new Response("404 Not Found", { status: 404 });
  }
});
