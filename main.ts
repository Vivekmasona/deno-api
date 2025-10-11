// main.ts
// Usage: /stream?url=<googlevideo_direct_url>
// Example: https://yourapp.deno.dev/stream?url=<encoded_googlevideo_url>

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return new Response("Deno video proxy. Use /stream?url=", { headers: { "content-type": "text/plain" } });
  }

  if (pathname === "/stream") {
    const raw = searchParams.get("url");
    if (!raw) return jsonErr("Missing ?url=");
    // decode if encoded in query
    const videoUrl = decodeURIComponent(raw);

    try {
      // Forward Range header if client requests partial content
      const clientRange = req.headers.get("range") || undefined;

      // Prepare headers to appear as a browser
      const forwardHeaders: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.youtube.com/",
        // optional: "Origin": "https://www.youtube.com",
      };
      if (clientRange) forwardHeaders["Range"] = clientRange;

      const upstreamRes = await fetch(videoUrl, {
        method: "GET",
        headers: forwardHeaders,
      });

      // If upstream denies (403/401), forward the status & body
      if (!upstreamRes.ok) {
        // Return the upstream status and text for debugging
        const text = await upstreamRes.text().catch(() => "");
        return new Response(text || `Upstream returned ${upstreamRes.status}`, {
          status: upstreamRes.status,
          headers: { "content-type": "text/plain" },
        });
      }

      // Prepare response headers to client
      const headers = new Headers();
      const ct = upstreamRes.headers.get("content-type");
      const cl = upstreamRes.headers.get("content-length");
      const cr = upstreamRes.headers.get("content-range");
      const acceptRanges = upstreamRes.headers.get("accept-ranges") || "bytes";

      if (ct) headers.set("content-type", ct);
      if (cl) headers.set("content-length", cl);
      if (cr) headers.set("content-range", cr);
      if (acceptRanges) headers.set("accept-ranges", acceptRanges);
      // allow CORS if frontend will fetch
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      headers.set("Cache-Control", "no-cache");

      // Stream the body directly
      return new Response(upstreamRes.body, {
        status: upstreamRes.status === 206 ? 206 : 200,
        headers,
      });
    } catch (err) {
      return jsonErr(String(err));
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// helpers
function jsonErr(msg: string) {
  return new Response(JSON.stringify({ status: "error", message: msg }, null, 2), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}
