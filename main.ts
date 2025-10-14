// Deno YouTube extractor + best-effort signature decipher
// Usage: /ytdl?url=https://youtu.be/FkFvdukWpAI
// NOTE: This is best-effort and supports common cipher ops (reverse, slice, swap).
// It may fail if YouTube player JS has changed drastically.

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return json({
      status: "success",
      message: "🦕 Deno YouTube Extractor Running! Use /ytdl?url=..."
    });
  }

  if (pathname === "/ytdl") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");

    try {
      const res = await fetch(ytUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();

      // Extract player JSON robustly
      const playerMatch =
        html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s) ||
        html.match(/window\["ytInitialPlayerResponse"\]\s*=\s*(\{.+?\});/s);

      if (!playerMatch) return error("Could not parse player JSON");

      const player = JSON.parse(playerMatch[1]);
      const videoDetails = player.videoDetails || {};
      const streamingData = player.streamingData || {};
      const formats = streamingData.formats || [];
      const adaptive = streamingData.adaptiveFormats || [];
      const allRaw = [...formats, ...adaptive];

      // find player JS URL (several possible patterns)
      const playerJsUrl = extractPlayerJsUrl(html);

      // fetch player JS if available
      let playerJs = null;
      if (playerJsUrl) {
        try {
          const fullUrl = absolutify(playerJsUrl, ytUrl);
          const pRes = await fetch(fullUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          playerJs = await pRes.text();
        } catch (e) {
          // ignore, we'll still return parsed data
          playerJs = null;
        }
      }

      // If we have playerJs, try extract token ops
      let tokens: string[] | null = null;
      if (playerJs) {
        try {
          tokens = extractSignatureTokens(playerJs);
        } catch (e) {
          tokens = null;
        }
      }

      // parse cipher helper
      function parseCipher(cipherStr: string | undefined) {
        if (!cipherStr) return null;
        try {
          const params = new URLSearchParams(cipherStr);
          const obj: Record<string, string> = {};
          for (const [k, v] of params.entries()) obj[k] = v;
          return obj;
        } catch (e) {
          return null;
        }
      }

      // apply tokens to signature (best-effort)
      function decipherSignature(s: string, tokensList: string[] | null) {
        if (!tokensList) return null;
        let arr = s.split("");
        for (const t of tokensList) {
          if (t.startsWith("r")) {
            arr = arr.reverse();
          } else if (t.startsWith("s")) {
            // slice: sN -> remove first N chars
            const n = parseInt(t.slice(1), 10);
            arr = arr.slice(n);
          } else if (t.startsWith("w")) {
            // swap: wN -> swap 0 and N
            const n = parseInt(t.slice(1), 10);
            if (!isNaN(n) && arr.length > 0) {
              const idx = n % arr.length;
              const tmp = arr[0];
              arr[0] = arr[idx];
              arr[idx] = tmp;
            }
          } else {
            // unknown token -> skip
          }
        }
        return arr.join("");
      }

      // Build formats array and attempt to produce working url if possible
      const allFormats = allRaw.map((f: any) => {
        const cipher = parseCipher(f.signatureCipher || f.cipher);
        let directUrl = f.url || (cipher && cipher.url) || null;
        let needsDecipher = false;
        let decipheredUrl: string | null = null;
        let hasSig = false;

        if (cipher) {
          // if cipher has s, it needs decipher
          if (cipher.s) {
            needsDecipher = true;
            hasSig = true;
            if (tokens) {
              try {
                const dec = decipherSignature(cipher.s, tokens);
                if (dec) {
                  // append signature param to url properly — param key often in 'sp' or fixed 'signature' or 'sig'
                  const urlBase = cipher.url;
                  const sp = cipher.sp || "signature"; // sometimes 'sp' is 'sig' or 'signature'
                  const sep = urlBase.includes("?") ? "&" : "?";
                  decipheredUrl = `${urlBase}${sep}${sp}=${encodeURIComponent(dec)}`;
                }
              } catch (e) {
                decipheredUrl = null;
              }
            }
          } else if (cipher.sig || cipher.sig) {
            // some ciphers give sig directly
            hasSig = true;
            const urlBase = cipher.url;
            const sp = cipher.sp || "signature";
            const sep = urlBase.includes("?") ? "&" : "?";
            decipheredUrl = `${urlBase}${sep}${sp}=${encodeURIComponent(cipher.sig || cipher.signature)}`;
            directUrl = decipheredUrl;
            needsDecipher = false;
          }
        }

        // prefer decipheredUrl if available, else directUrl
        const finalUrl = decipheredUrl || directUrl;

        return {
          itag: f.itag,
          mimeType: f.mimeType || f.mime,
          qualityLabel: f.qualityLabel || f.audioQuality || "N/A",
          bitrate: f.bitrate || null,
          audioBitrate: f.audioBitrate || null,
          contentLength: f.contentLength || null,
          url: finalUrl,
          parsedCipher: cipher,
          needsDecipher: !!(needsDecipher && !decipheredUrl),
          hasSig,
        };
      });

      const audioFormats = allFormats.filter((x: any) => x.mimeType && x.mimeType.includes("audio"));
      const videoFormats = allFormats.filter((x: any) => x.mimeType && x.mimeType.includes("video"));

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
        meta: {
          playerJsUrl: playerJsUrl || null,
          tokensFound: !!tokens,
          note:
            tokens
              ? "Decipher tokens extracted — applied to formats with signature cipher."
              : "No decipher tokens extracted; formats needing decipher will be flagged needsDecipher=true. Use ytdl-core/yt-dlp for robust results.",
        },
      });
    } catch (err) {
      return error(String(err?.message || err));
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// ----------------- Helpers -----------------

function json(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" },
  });
}

function error(msg: string) {
  return json({ status: "error", message: msg });
}

// Make relative player js URLs absolute relative to page url
function absolutify(urlStr: string, pageUrl: string) {
  if (/^https?:\/\//i.test(urlStr)) return urlStr;
  // youtube often uses protocol-relative or absolute path
  if (urlStr.startsWith("//")) {
    return "https:" + urlStr;
  }
  const base = new URL(pageUrl);
  if (urlStr.startsWith("/")) {
    return `${base.protocol}//${base.host}${urlStr}`;
  }
  return urlStr;
}

// Tries multiple patterns to find the player base.js url from HTML
function extractPlayerJsUrl(html: string): string | null {
  // pattern 1: "jsUrl":"\/s\/player\/....\/base.js"
  let m = html.match(/"jsUrl":"([^"]+)"/);
  if (m) return m[1].replace(/\\\//g, "/");

  // pattern 2: src="/s/player/....base.js"
  m = html.match(/src="([^"]*player[^"]*base\.js)"/);
  if (m) return m[1];

  // pattern 3: "PLAYER_JS_URL":"https://www.youtube.com/s/player/..."
  m = html.match(/"PLAYER_JS_URL":"([^"]+)"/);
  if (m) return m[1].replace(/\\\//g, "/");

  // pattern 4: look for /s/player/.../base.js
  m = html.match(/\/s\/player\/[a-zA-Z0-9\/\._-]+\/base\.js/);
  if (m) return m[0];

  // fallback: search any .js that contains "player" in url near youtube domain
  m = html.match(/https?:\/\/[^"]+player[-_a-zA-Z0-9\/\.]*\.js/);
  if (m) return m[0];

  return null;
}

/*
  extractSignatureTokens(playerJs)
  - attempts to find the signature transformation function in player JS
  - returns a list of tokens like ['r','s3','w2'] meaning reverse, slice(3), swap(2)
  - This is a simplified parser modeled after common patterns:
      - functionName(a){a=a.split("");...}
      - operations usually map to helper object methods like A.B(a,2); where helpers are defined nearby.
  - This is best-effort and intentionally small to avoid huge dependency.
*/
function extractSignatureTokens(js: string): string[] | null {
  // 1) Find the name of the signature function: something like: a.sig&&(a.sig=ytPlayerFunction(a.s))
  // Common pattern: var YTPlayer = { ... }; function <fnName>(a){a=a.split("");<ops>;return a.join("")}
  // Try to match: .set("signature", <name>(s))
  let fnNameMatch =
    js.match(/\.sig\|\|([a-zA-Z0-9$]+)\(/) ||
    js.match(/signature=([a-zA-Z0-9$]+)\(/) ||
    js.match(/"signature",\s*([a-zA-Z0-9$]+)\(/) ||
    js.match(/\.set\("signature",\s*([a-zA-Z0-9$]+)\(/);

  // fallback: look for something like: (?:\b|[^A-Za-z0-9_$])([a-zA-Z0-9$]{2,})\s*=\s*function\(\w\)\{\w=\w\.split\(""\)
  if (!fnNameMatch) {
    const fmatch = js.match(/([a-zA-Z0-9$]{2,})\s*=\s*function\(\w\)\{\w=\w\.split\(""\)/);
    if (fmatch) fnNameMatch = fmatch;
  }

  if (!fnNameMatch) return null;
  const fnName = fnNameMatch[1];

  // 2) Find the function body for fnName
  // two forms: function fnName(a){...}   OR   var fnName=function(a){...}
  const fnRegex = new RegExp(`${escapeRegex(fnName)}\\s*=\\s*function\\(\\w\\)\\s*\\{([\\s\\S]*?)\\}`, "m");
  let bodyMatch = js.match(fnRegex);
  if (!bodyMatch) {
    const fnRegex2 = new RegExp(`function\\s+${escapeRegex(fnName)}\\(\\w\\)\\s*\\{([\\s\\S]*?)\\}`, "m");
    bodyMatch = js.match(fnRegex2);
  }
  if (!bodyMatch) return null;
  const fnBody = bodyMatch[1];

  // 3) Identify helper object name used inside function (common pattern: var ab={reverse:...,slice:...}; a=ab.q(a,2)...)
  // find something like: objName.X(a,number)
  const helperMatch = fnBody.match(/([a-zA-Z0-9$]{2,})\.\w+\(\w,(\d+)\)/);
  const helperObj = helperMatch ? helperMatch[1] : null;

  // 4) If helperObj found, find its definitions to map method names to ops
  const tokens: string[] = [];

  // Find sequence of operations in fnBody: many implementations call helpers like: a = helper.X(a,2); a = helper.Y(a,3);
  const opRegex = helperObj
    ? new RegExp(`${escapeRegex(helperObj)}\\.([a-zA-Z0-9$]{1,})\\(\\w,(\\d+)\\)`, "g")
    : null;

  if (opRegex) {
    let m;
    while ((m = opRegex.exec(fnBody)) !== null) {
      const method = m[1];
      const num = m[2];
      // find definition of helperObj.method to determine what it does
      const methodDefRegex = new RegExp(`${escapeRegex(helperObj)}\\.${escapeRegex(method)}\\s*=\\s*function\\([\\w,]+\\)\\s*\\{([\\s\\S]*?)\\}`, "m");
      const defMatch = js.match(methodDefRegex);
      const def = defMatch ? defMatch[1] : "";
      if (/reverse\(|\.reverse\(/.test(def) || /reverse;/.test(def)) {
        tokens.push("r");
      } else if (/splice\(|\.splice\(/.test(def) || /slice\(/.test(def)) {
        // treat as slice
        tokens.push("s" + num);
      } else if (/var c=0;|var b=0;/.test(def) || /swap/.test(def) || /var d=/.test(def) || /\[\w\]=\w\[0\]/.test(def)) {
        tokens.push("w" + num);
      } else {
        // unknown, try heuristics: if def includes 'reverse' => r, if includes 'slice' => s
        if (def.includes("reverse")) tokens.push("r");
        else if (def.includes("slice")) tokens.push("s" + num);
        else tokens.push("w" + num); // fallback to swap
      }
    }
  }

  // If no helper-based ops found, attempt to parse inline ops inside fnBody directly
  if (tokens.length === 0) {
    // look for .reverse() usage
    if (fnBody.includes(".reverse(") || fnBody.includes(".reverse()")) {
      tokens.push("r");
    }
    // look for slice or splice calls with constants
    const sliceMatches = fnBody.match(/\.slice\((\d+)\)/g);
    if (sliceMatches) {
      for (const sm of sliceMatches) {
        const n = sm.match(/\.slice\((\d+)\)/)![1];
        tokens.push("s" + n);
      }
    }
    // look for swap like assignments e.g., var c=a[0];a[0]=a[b%a.length];a[b]=c;
    const swapMatch = fnBody.match(/\w\[0\]\s*=\s*\w\[\w%/);
    if (swapMatch) {
      // try to extract number used
      const numMatch = fnBody.match(/\%(\d+)\)/);
      const num = numMatch ? parseInt(numMatch[1], 10) : 2;
      tokens.push("w" + num);
    }
  }

  return tokens.length > 0 ? tokens : null;
}

// small util to escape regex special chars
function escapeRegex(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
              }
