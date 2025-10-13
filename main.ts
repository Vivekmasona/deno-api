import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PORT = Number(Deno.env.get("PORT")) || 8000;

// Clean HTML
function cleanText(s: string) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Detect math / percentage query
function isMathQuery(q: string): boolean {
  return /^[0-9+\-×x*/÷%^().\s]+$/.test(q.replace(/\s+/g, "")) || /percent|%/i.test(q);
}

// Compute math / percentage
function computeMath(q: string): string {
  try {
    let expr = q.replace(/÷/g, "/").replace(/[×x]/gi, "*").replace(/(\d+)\s*%/gi, "($1/100)");
    // eslint-disable-next-line no-eval
    const result = eval(expr);
    return result.toString();
  } catch {
    return "Error computing expression";
  }
}

// Fetch DuckDuckGo top results
async function fetchTopResult(query: string): Promise<string | null> {
  const url = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();

  const regex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/i;
  const match = regex.exec(html);
  if (!match) return null;

  let link = match[1];
  if (link.includes("uddg=")) {
    try {
      const u = new URL("https://duckduckgo.com" + link);
      const encoded = u.searchParams.get("uddg");
      if (encoded) link = decodeURIComponent(encoded);
    } catch {}
  }

  // Fetch first paragraphs
  try {
    const pageRes = await fetch(link, { headers: { "User-Agent": "Mozilla/5.0" } });
    const pageHtml = await pageRes.text();
    const paragraphs = Array.from(pageHtml.matchAll(/<p>(.*?)<\/p>/gi))
      .map(p => cleanText(p[1]))
      .filter(p => p.split(" ").length > 15)
      .slice(0, 5);
    if (paragraphs.length) return paragraphs.join(" ");
  } catch {}

  return null;
}

console.log(`Single-answer QA server running on http://localhost:${PORT}`);

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/ask") {
    const query = searchParams.get("q")?.trim();
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query parameter 'q'" }), { headers: { "Content-Type": "application/json" } });
    }

    try {
      let answerText: string;

      if (isMathQuery(query)) {
        answerText = computeMath(query);
      } else {
        const fetched = await fetchTopResult(query);
        answerText = fetched || "Sorry, no answer found.";
      }

      return new Response(JSON.stringify({
        query,
        answer: {
          summary: answerText
        }
      }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { headers: { "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ message: "Use /ask?q=your+question" }), { headers: { "Content-Type": "application/json" } });
}, { port: PORT });
