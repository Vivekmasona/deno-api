import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PORT = Number(Deno.env.get("PORT")) || 8000;

// Clean HTML tags
function cleanText(s: string) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Hindi math word mapping
const hindiOps: Record<string, string> = {
  "ghatane": "-",
  "badhane": "+",
  "guna": "*",
  "gunakarne": "*",
  "bhag": "/",
  "bhagkarne": "/",
  "%": "/100"
};

// Detect math query (numbers + operators + Hindi words)
function isMathQuery(q: string): boolean {
  const mathRegex = /^[0-9+\-×x*/÷%^().\s]+$/;
  const containsHindiOps = Object.keys(hindiOps).some(word => q.includes(word));
  return mathRegex.test(q.replace(/\s+/g, "")) || containsHindiOps || /percent|%/i.test(q);
}

// Convert Hindi query to computable expression
function convertHindiMath(q: string): string {
  let expr = q.toLowerCase();
  for (const [word, op] of Object.entries(hindiOps)) {
    expr = expr.replace(new RegExp(word, "gi"), op);
  }
  // Replace ÷ → /, ×/x → *
  expr = expr.replace(/÷/g, "/").replace(/[×x]/gi, "*");
  // Convert "ka" % patterns
  expr = expr.replace(/(\d+)\s*%/gi, "($1/100)");
  return expr;
}

// Compute math
function computeMath(q: string): string {
  try {
    const expr = convertHindiMath(q);
    // eslint-disable-next-line no-eval
    const result = eval(expr);
    return result.toString();
  } catch {
    return "Error computing expression";
  }
}

// Fetch top DuckDuckGo result and extract summary
async function fetchTopSummary(query: string): Promise<string> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();

    const regex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/i;
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

    // Fetch first paragraphs from top article
    try {
      const pageRes = await fetch(link, { headers: { "User-Agent": "Mozilla/5.0" } });
      const pageHtml = await pageRes.text();
      const paragraphs = Array.from(pageHtml.matchAll(/<p>(.*?)<\/p>/gi))
        .map(p => cleanText(p[1]))
        .filter(p => p.split(" ").length > 15)
        .slice(0, 5);

      if (paragraphs.length) return paragraphs.join(" ");
    } catch {}

    return "Sorry, no answer found.";
  } catch {
    return "Sorry, no answer found.";
  }
}

console.log(`Universal QA server running on http://localhost:${PORT}`);

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
        answerText = await fetchTopSummary(query);
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
