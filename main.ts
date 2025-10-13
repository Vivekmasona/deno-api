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

// Simple relevance scoring: query words in title/URL
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

// Fetch page summary (first 3 paragraphs with >20 words)
async function fetchSummary(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();

    const paragraphs = Array.from(html.matchAll(/<p>(.*?)<\/p>/gi))
      .map(p => cleanText(p[1]))
      .filter(p => p.split(" ").length > 10)
      .slice(0, 3);

    if (paragraphs.length === 0) return undefined;
    return paragraphs.join(" ");
  } catch {
    return undefined;
  }
}

console.log(`Internet Question-Answer JSON server running on http://localhost:${PORT}`);

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/ask") {
    const query = searchParams.get("q")?.trim();
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query parameter 'q'" }), { headers: { "Content-Type": "application/json" } });
    }

    try {
      let results = await fetchDuckResults(query, 15);
      if (results.length === 0) {
        return new Response(JSON.stringify({ query, answer: null, other_results: [] }), { headers: { "Content-Type": "application/json" } });
      }

      // Compute relevance scores
      for (const r of results) r.score = relevanceScore(r.title, r.url, query);

      // Sort descending by score
      results.sort((a, b) => (b.score || 0) - (a.score || 0));

      // Try to find top answer with meaningful summary
      let top_answer: Result | null = null;
      for (const r of results) {
        const summary = await fetchSummary(r.url);
        if (summary && summary.split(" ").length > 20) {
          top_answer = { ...r, summary };
          break;
        }
      }

      // If no good summary, fallback to first result
      if (!top_answer) top_answer = results[0];

      const other_results = results.filter(r => r.url !== top_answer.url).slice(0, 10);

      return new Response(JSON.stringify({ query, answer: top_answer, other_results }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { headers: { "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ message: "Use /ask?q=your+question" }), { headers: { "Content-Type": "application/json" } });
}, { port: PORT });
