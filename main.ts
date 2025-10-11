// 🦕 Google Search JSON API (Unofficial)
// Example: https://yourapp.deno.dev/gsearch?q=hindi+song

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  // Root info
  if (pathname === "/") {
    return new Response("🦕 Google Search JSON API Running!\nUse /gsearch?q=your+query", {
      headers: { "content-type": "text/plain" },
    });
  }

  // ✅ Google Search Route
  if (pathname === "/gsearch") {
    const query = searchParams.get("q");
    if (!query) return error("Missing ?q=");

    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const html = await res.text();

      // Extract search result blocks
      const regex = /<a href="(https?:\/\/[^"]+)"[^>]*><h3[^>]*>(.*?)<\/h3><\/a>.*?<div class="VwiC3b">(.*?)<\/div>/gs;

      const results = [];
      let match;
      while ((match = regex.exec(html)) !== null) {
        const link = decodeHtml(match[1]);
        const title = decodeHtml(stripHtml(match[2]));
        const snippet = decodeHtml(stripHtml(match[3]));
        results.push({ title, link, snippet });
      }

      return json({
        status: "success",
        query,
        count: results.length,
        results: results.slice(0, 10),
      });
    } catch (err) {
      return error(err.message);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// 🔧 Helper functions
function json(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" },
  });
}

function error(message: string) {
  return json({ status: "error", message });
}

function stripHtml(str: string) {
  return str.replace(/<[^>]*>/g, "");
}

function decodeHtml(str: string) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
