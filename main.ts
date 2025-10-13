import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PORT = Number(Deno.env.get("PORT")) || 8000;

// Clean HTML tags
function cleanText(s: string) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Fetch Wikipedia summary (English first, then fallback to Hindi)
async function fetchWikiSummary(query: string): Promise<string> {
  try {
    const enUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const resEn = await fetch(enUrl);
    const dataEn = await resEn.json();

    if (dataEn.extract) return cleanText(dataEn.extract);

    // Try Hindi Wikipedia
    const hiUrl = `https://hi.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const resHi = await fetch(hiUrl);
    const dataHi = await resHi.json();

    if (dataHi.extract) return cleanText(dataHi.extract);

    return "Sorry, no answer found.";
  } catch {
    return "Sorry, no answer found.";
  }
}

console.log(`Wikipedia QA server running on http://localhost:${PORT}`);

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/ask") {
    const query = searchParams.get("q")?.trim();
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query parameter 'q'" }), { headers: { "Content-Type": "application/json" } });
    }

    const summary = await fetchWikiSummary(query);

    return new Response(JSON.stringify({
      query,
      answer: {
        summary
      }
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ message: "Use /ask?q=your+question" }), { headers: { "Content-Type": "application/json" } });
}, { port: PORT });
