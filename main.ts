import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PORT = Number(Deno.env.get("PORT")) || 8000;

// Escape HTML
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
}

// Fetch DuckDuckGo top results (simple HTML parse)
async function getDuckResults(query: string, max = 5): Promise<{title:string,url:string}[]> {
  const url = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();

  const results: {title:string,url:string}[] = [];
  const regex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null && results.length < max) {
    let link = match[1];
    let title = match[2].replace(/<[^>]*>/g, ""); // strip inner HTML
    if (link.includes("uddg=")) {
      try {
        const u = new URL("https://duckduckgo.com" + link);
        const encoded = u.searchParams.get("uddg");
        if (encoded) link = decodeURIComponent(encoded);
      } catch {}
    }
    if (/^https?:\/\//i.test(link)) {
      results.push({title, url: link});
    }
  }
  return results;
}

console.log(`Deno Internet Search running on http://localhost:${PORT}`);

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return new Response(`
      <html>
        <head><meta charset="utf-8"><title>Internet Search Mini Browser</title></head>
        <body style="font-family:system-ui;padding:20px">
          <h2>Search Internet</h2>
          <form method="GET" action="/search">
            <input name="q" placeholder="Type search term" style="width:60%;padding:8px" required>
            <button type="submit" style="padding:8px 12px">Search</button>
          </form>
        </body>
      </html>
    `, { headers: { "Content-Type": "text/html" } });
  }

  if (pathname === "/search") {
    const q = searchParams.get("q")?.trim() || "";
    if (!q) return new Response("Provide search term");

    try {
      const results = await getDuckResults(q, 5);
      if (results.length === 0) return new Response(`<p>No results found for ${escapeHtml(q)}</p><a href="/">Back</a>`, { headers: { "Content-Type": "text/html" } });

      let html = `<html><body style="font-family:system-ui;padding:20px">
        <h3>Top results for: ${escapeHtml(q)}</h3>
        <ul>`;
      for (const r of results) {
        html += `<li><a href="/proxy?url=${encodeURIComponent(r.url)}" target="_blank">${escapeHtml(r.title)}</a> - <a href="${escapeHtml(r.url)}" target="_blank">Direct</a></li>`;
      }
      html += `</ul><p><a href="/">New search</a></p></body></html>`;

      return new Response(html, { headers: { "Content-Type": "text/html" } });
    } catch (err) {
      return new Response(`<p>Error: ${escapeHtml(err.message)}</p><a href="/">Back</a>`, { headers: { "Content-Type": "text/html" } });
    }
  }

  if (pathname === "/proxy") {
    const url = searchParams.get("url");
    if (!url) return new Response("Missing url");
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const text = await res.text();
      return new Response(text, { headers: { "Content-Type": "text/html" } });
    } catch (err) {
      return new Response(`<p>Failed to fetch: ${escapeHtml(err.message)}</p><a href="/">Back</a>`, { headers: { "Content-Type": "text/html" } });
    }
  }

  return new Response("Not Found", { status: 404 });
}, { port: PORT });
