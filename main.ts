import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PORT = Number(Deno.env.get("PORT")) || 8000;

// Simple math detection
function isMathQuery(q: string) {
  return /[\d+\-*/%÷×^=()]/.test(q);
}

// Evaluate simple arithmetic
function computeMath(q: string): string {
  try {
    // Replace ÷ and × with JS operators
    const expr = q.replace(/÷/g, "/").replace(/×/g, "*");
    // eslint-disable-next-line no-eval
    const result = eval(expr);
    if (result !== undefined) return `${q} = ${result}`;
    return "Unable to compute.";
  } catch {
    return "Unable to compute.";
  }
}

// Fetch Wikipedia summary
async function fetchWikiSummary(query: string): Promise<string> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return "Sorry, no answer found.";
    const data = await res.json();
    if (data.extract) return data.extract;
    return "Sorry, no answer found.";
  } catch {
    return "Sorry, no answer found.";
  }
}

console.log(`Wiki + Math QA server running on http://localhost:${PORT}`);

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/ask") {
    const query = searchParams.get("q")?.trim();
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query parameter 'q'" }), { headers: { "Content-Type": "application/json" } });
    }

    let summary: string;

    if (isMathQuery(query)) {
      summary = computeMath(query);
    } else {
      summary = await fetchWikiSummary(query);
    }

    return new Response(JSON.stringify({
      query,
      answer: { summary }
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ message: "Use /ask?q=your+question" }), { headers: { "Content-Type": "application/json" } });
}, { port: PORT });
