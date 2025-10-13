import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PORT = Number(Deno.env.get("PORT")) || 8000;

// Clean HTML tags
function cleanText(s: string) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Fetch top DuckDuckGo result
async function fetchTopArticleSummary(query: string): Promise<string> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();

    // Get top link
    const regex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"/i;
    const match = regex.exec(html);
    if (!match) return "Sorry, no answer found.";

    let link = match[1];
    if (link.includes("uddg=")) {
      try {
        const u = new URL("https://duckduckgo.com" + link);
        const encoded = u.searchParams.get("uddg");
        if (encoded) link = decodeURIComponent(encoded);
      } catch {}
    }

    // Fetch top article content
    const pageRes = await fetch(link, { headers: { "User-Agent": "Mozilla/5.0" } });
    const pageHtml = await pageRes.text();

    const paragraphs = Array.from(pageHtml.matchAll(/<p>(.*?)<\/p>/gi))
      .map(p => cleanText(p[1]))
      .filter(p => p.split(" ").length > 20) // meaningful paragraphs
      .slice(0, 5);

    if (paragraphs.length === 0) return "Sorry, no answer found.";

    return paragraphs.join(" ");
  } catch {
    return "Sorry, no answer found.";
  }
}

console.log(`Top-article QA server running on http://localhost:${PORT}`);

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/ask") {
    const query = searchParams.get("q")?.trim();
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query parameter 'q'" }), { headers: { "Content-Type": "application/json" } });
    }

    const summary = await fetchTopArticleSummary(query);

    return new Response(JSON.stringify({
      query,
      answer: {
        summary
      }
    }, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ message: "Use /ask?q=your+question" }), { headers: { "Content-Type": "application/json" } });
}, { port: PORT });
