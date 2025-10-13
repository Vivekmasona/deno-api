import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PORT = Number(Deno.env.get("PORT")) || 8000;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
}

async function getFirstDuckUrl(query: string): Promise<string | null> {
  const url = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();

  // Simple regex to extract first href from a.result__a
  const match = html.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/i);
  if (!match) return null;
  let link = match[1];

  // Check for uddg redirect param
  if (link.includes("uddg=")) {
    try {
      const u = new URL("https://duckduckgo.com" + link);
      const encoded = u.searchParams.get("uddg");
      if (encoded) link = decodeURIComponent(encoded);
    } catch {}
  }

  if (!/^https?:\/\//i.test(link)) return null;
  return link;
}

console.log(`Deno hostable mini-browser running on http://localhost:${PORT}`);

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return new Response(`
      <html>
        <head><meta charset="utf-8"><title>Hostable Mini Browser</title></head>
        <body style="font-family:system-ui;padding:20px">
          <h2>Enter search name</h2>
          <form method="GET" action="/search">
            <input name="q" placeholder="Search term" style="width:60%;padding:8px" required>
            <select name="mode" style="padding:8px">
              <option value="link">Show URL only</option>
              <option value="proxy">Show proxied content</option>
            </select>
            <button type="submit" style="padding:8px 12px">Search</button>
          </form>
        </body>
      </html>
    `, { headers: { "Content-Type": "text/html" } });
  }

  if (pathname === "/search") {
    const q = searchParams.get("q")?.trim() || "";
    const mode = searchParams.get("mode") || "link";
    if (!q) return new Response("Provide a search term");

    const firstUrl = await getFirstDuckUrl(q);
    if (!firstUrl) return new Response(`<p>No result found for ${escapeHtml(q)}</p>`, { headers: { "Content-Type": "text/html" } });

    if (mode === "link") {
      return new Response(`
        <html><body style="font-family:system-ui;padding:20px">
          <h3>Top result for: ${escapeHtml(q)}</h3>
          <p><a href="${escapeHtml(firstUrl)}" target="_blank">${escapeHtml(firstUrl)}</a></p>
          <p><a href="/search?q=${encodeURIComponent(q)}&mode=proxy" target="_blank">Proxy page</a></p>
          <p><a href="/">New search</a></p>
        </body></html>
      `, { headers: { "Content-Type": "text/html" } });
    } else {
      // proxy mode: fetch page content
      try {
        const pageResp = await fetch(firstUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        const pageHtml = await pageResp.text();
        return new Response(`
          <html><body style="margin:0;padding:0">
            <div style="padding:10px;background:#eee;border-bottom:1px solid #ccc">
              <b>Search:</b> ${escapeHtml(q)} | <b>URL:</b> <a href="${escapeHtml(firstUrl)}" target="_blank">${escapeHtml(firstUrl)}</a>
              &nbsp;|&nbsp; <a href="/">New search</a>
            </div>
            <div style="padding:12px">${pageHtml}</div>
          </body></html>
        `, { headers: { "Content-Type": "text/html" } });
      } catch (err) {
        return new Response(`<p>Failed to fetch page: ${escapeHtml(err.message)}</p><a href="/">Back</a>`, { headers: { "Content-Type": "text/html" } });
      }
    }
  }

  return new Response("Not Found", { status: 404 });
}, { port: PORT });
