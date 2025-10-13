import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PORT = Number(Deno.env.get("PORT")) || 8000;

interface Result {
  title: string;
  url: string;
  score?: number;
}

// Escape HTML just in case
function cleanText(s: string) {
  return s.replace(/<[^>]*>/g, "").trim();
}

// Compute simple relevance score based on query match in title/URL
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

// Fetch top results from DuckDuckGo
async function fetchDuckResults(query: string, max = 10): Promise<Result[]> {
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

console.log(`Deno Internet JSON Search running on http://localhost:${PORT}`);

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/search") {
    const query = searchParams.get("q")?.trim();
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query parameter 'q'" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const results = await fetchDuckResults(query, 10);

      if (results.length === 0) {
        return new Response(JSON.stringify({ query, top_result: null, other_results: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Compute relevance scores
      for (const r of results) {
        r.score = relevanceScore(r.title, r.url, query);
      }

      // Sort by score descending
      results.sort((a, b) => (b.score || 0) - (a.score || 0));

      const top_result = results[0];
      const other_results = results.slice(1);

      const json = { query, top_result, other_results };

      return new Response(JSON.stringify(json, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ message: "Use /search?q=your+query" }), {
    headers: { "Content-Type": "application/json" },
  });
}, { port: PORT });
