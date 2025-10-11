Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return new Response("🦕 Google JSON Search API — use /gsearch?q=your+query", {
      headers: { "content-type": "text/plain" },
    });
  }

  if (pathname === "/gsearch") {
    const query = searchParams.get("q");
    if (!query) return error("Missing ?q=");

    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&num=20`;
      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.1 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const html = await res.text();

      // ✅ Match each result block — more flexible regex
      const regex = /<a href="\/url\?q=(https[^"&]+)[^>]*"><h3[^>]*>(.*?)<\/h3>/gs;
      const results: any[] = [];
      let match;

      while ((match = regex.exec(html)) !== null) {
        const link = decodeURIComponent(match[1]);
        const title = decodeHtml(stripHtml(match[2]));

        // Snippet text (try to match next div)
        const after = html.slice(match.index + match[0].length, match.index + 500);
        const snippetMatch = after.match(/<div class="[^"]*?VwiC3b[^"]*?".*?>(.*?)<\/div>/s);
        const snippet = snippetMatch ? decodeHtml(stripHtml(snippetMatch[1])) : "";

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

// Helpers
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
