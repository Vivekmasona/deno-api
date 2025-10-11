// 🦕 DuckDuckGo JSON Search API Wrapper
// Example: https://yourapp.deno.dev/search?q=hindi+funny

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  // Root info
  if (pathname === "/") {
    return new Response(
      "🦕 DuckDuckGo JSON Search API\nUse /search?q=your+query",
      { headers: { "content-type": "text/plain" } }
    );
  }

  // Search endpoint
  if (pathname === "/search") {
    const query = searchParams.get("q");
    if (!query) return error("Missing ?q=");

    try {
      // Fetch JSON from DuckDuckGo Instant Answer API
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(url);
      const data = await res.json();

      // Extract relevant results
      const results: Array<{ title: string; link: string; snippet: string }> = [];

      // 1️⃣ RelatedTopics (main search results)
      if (data.RelatedTopics?.length) {
        for (const item of data.RelatedTopics) {
          if (item.Text && item.FirstURL) {
            results.push({
              title: item.Text,
              link: item.FirstURL,
              snippet: item.Text,
            });
          } else if (item.Topics) {
            for (const sub of item.Topics) {
              if (sub.Text && sub.FirstURL) {
                results.push({
                  title: sub.Text,
                  link: sub.FirstURL,
                  snippet: sub.Text,
                });
              }
            }
          }
        }
      }

      // 2️⃣ AbstractResult (if exists)
      if (data.AbstractText && data.AbstractURL) {
        results.unshift({
          title: data.Heading || "Abstract",
          link: data.AbstractURL,
          snippet: data.AbstractText,
        });
      }

      return json({
        status: "success",
        query,
        count: results.length,
        results: results.slice(0, 10), // top 10 results
      });
    } catch (err) {
      return error(err.message);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// ---------------- Helper Functions ----------------

function json(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" },
  });
}

function error(message: string) {
  return json({ status: "error", message });
}
