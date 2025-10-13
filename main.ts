import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PORT = Number(Deno.env.get("PORT")) || 8000;

interface Result {
  title: string;
  url: string;
  summary?: string;
  score?: number;
}

// Clean HTML tags
function cleanText(s: string) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Compute simple relevance score based on query in title/url
function relevanceScore(title: string, url: string, query: string): number {
  const qWords = query.toLowerCase().split(/\s+/);
  let score = 0;
  const t = title.toLowerCase();
  const u = url.toLowerCase();
  for (const w of qWords) {
    if (t.includes(w)) score += 5;
    if (u.includes(w)) score += 3;
  }
  return score;
}

// Fetch DuckDuckGo top results (max 15)
async function fetchDuckResults(query: string, max = 15): Promise<Result[]> {
  const url = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();

  const results: Result[] = [];
  const regex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null && results.length < max) {
    let link = match[1];
    let title = cleanText(match[2]);

    // Handle DuckDuckGo uddg redirect
    if (link.includes("uddg=")) {
      try {
        const u = new URL("https://duckduckgo.com" + link);
        const encoded = u.searchParams.get("uddg");
        if (encoded) link = decodeURIComponent(encoded);
      } catch {}
    }

    if (/^https?:\/\//i.test(link)) results.push({ title, url: link });
  }
  return results;
}

// Try to fetch summary text from page
async function fetchSummary(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();

    // Extract first 2–3 paragraphs
    const paragraphs = Array.from(html.matchAll(/<p>(.*?)<\/p>/gi)).slice(0, 3).map(p => cleanText(p[1]));
    if (paragraphs.length === 0) return undefined;
    return paragraphs.join(" ");
  } catch {
    return undefined;
  }
}

console.log(`Google-style JSON search running on http://localhost:${PORT}`);

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/search") {
    const query = searchParams.get("q")?.trim();
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query parameter 'q'" }), { headers: { "Content-Type": "application/json" } });
    }

    try {
      let results = await fetchDuckResults(query, 15);
      if (results.length === 0) {
        return new Response(JSON.stringify({ query, top_article: null, other_results: [] }), { headers: { "Content-Type": "application/json" } });
      }

      // Compute relevance score
      for (const r of results) {
        r.score = relevanceScore(r.title, r.url, query);
      }

      // Sort descending by score
      results.sort((a, b) => (b.score || 0) - (a.score || 0));

      // Find top article with content snippet
      let top_article: Result | null = null;
      for (const r of results) {
        const summary = await fetchSummary(r.url);
        if (summary && summary.split(" ").length > 20) { // require min 20 words
          top_article = { ...r, summary };
          break;
        }
      }

      // If no good article found, use first result as top_article
      if (!top_article) top_article = results[0];

      // Remove top_article from other_results
      const other_results = results.filter(r => r.url !== top_article.url).slice(0, 10);

      return new Response(JSON.stringify({ query, top_article, other_results }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { headers: { "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ message: "Use /search?q=your+query" }), { headers: { "Content-Type": "application/json" } });
}, { port: PORT });
