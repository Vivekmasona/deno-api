// Deno YouTube googlevideo redirector
// Usage:
//   /play?url=https://youtu.be/VIDEO_ID&type=audio   -> redirects to googlevideo audio URL
//   /play?url=https://youtu.be/VIDEO_ID&type=video   -> redirects to googlevideo video URL

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return new Response("YouTube googlevideo redirector\nUse /play?url=...&type=audio|video", {
      headers: { "content-type": "text/plain" },
    });
  }

  if (pathname === "/play") {
    const ytUrl = searchParams.get("url");
    const want = (searchParams.get("type") || "audio").toLowerCase(); // audio or video

    if (!ytUrl) {
      return json({ status: "error", message: "Missing ?url=" }, 400);
    }

    try {
      const res = await fetch(ytUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();

      // extract player JSON
      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (!playerMatch) return json({ status: "error", message: "No ytInitialPlayerResponse found" }, 500);

      const player = JSON.parse(playerMatch[1]);
      const streaming = player.streamingData || {};
      const formats = (streaming.formats || []).concat(streaming.adaptiveFormats || []);

      // choose candidate format
      let candidate = null;
      if (want === "audio") {
        candidate = formats.find((f: any) => /audio/.test(f.mimeType)) || null;
      } else {
        // prefer progressive mp4 video if available
        candidate =
          formats.find((f: any) => /video\/mp4/.test(f.mimeType) && f.width) ||
          formats.find((f: any) => /video/.test(f.mimeType)) ||
          null;
      }

      if (!candidate) return json({ status: "error", message: "No matching format found" }, 404);

      // If direct url present, use it
      if (candidate.url) {
        return Response.redirect(candidate.url, 302);
      }

      // If signatureCipher / cipher present, parse it
      const cipherText = candidate.signatureCipher || candidate.cipher;
      if (!cipherText) return json({ status: "error", message: "No URL or cipher found in format" }, 500);

      const params = new URLSearchParams(cipherText);
      const url = params.get("url");
      const s = params.get("s");
      const sp = params.get("sp") || params.get("sp") === "" ? params.get("sp") : "sig"; // sp param or fallback 'sig'
      const lsig = params.get("lsig");

      if (!url) return json({ status: "error", message: "cipher missing url param" }, 500);

      // Basic attempt: if 's' absent or sp missing, just redirect to url
      if (!s) {
        const final = lsig ? `${url}&lsig=${encodeURIComponent(lsig)}` : url;
        return Response.redirect(final, 302);
      }

      // If s present but not decoded: try common sp names
      // NOTE: This does NOT decrypt 's'. It only appends it using sp param which works in some older cases.
      const possibleSp = sp || "signature";
      const finalCandidate = `${url}&${possibleSp}=${encodeURIComponent(s)}`;
      // append lsig if present
      const finalUrl = lsig ? `${finalCandidate}&lsig=${encodeURIComponent(lsig)}` : finalCandidate;

      // Try redirect
      return Response.redirect(finalUrl, 302);
    } catch (err) {
      return json({ status: "error", message: err.message }, 500);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// helper
function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
