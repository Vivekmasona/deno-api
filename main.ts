import { Application, Router } from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { DOMParser, Element } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

// Helper to escape HTML
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
}

// Function to get first result URL from DuckDuckGo HTML
async function getFirstResultUrl(query: string): Promise<string | null> {
  const ddgUrl = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`;
  const res = await fetch(ddgUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  const text = await res.text();

  const doc = new DOMParser().parseFromString(text, "text/html");
  if (!doc) return null;

  let link: string | null = null;
  const a1 = doc.querySelector("a.result__a") as Element | null;
  if (a1 && a1.getAttribute("href")) link = a1.getAttribute("href");

  if (!link) {
    const a2 = doc.querySelector(".result a") as Element | null;
    if (a2 && a2.getAttribute("href")) link = a2.getAttribute("href");
  }

  // Redirect links with uddg param
  if (link && link.includes("uddg=")) {
    try {
      const url = new URL("https://duckduckgo.com" + link);
      const u = url.searchParams.get("uddg");
      if (u) link = decodeURIComponent(u);
    } catch {}
  }

  if (link && link.startsWith("/")) link = "https://duckduckgo.com" + link;
  if (!link || !/^https?:\/\//i.test(link)) return null;
  return link;
}

const app = new Application();
const router = new Router();

router
  .get("/", (ctx) => {
    ctx.response.body = `
      <html>
        <head><meta charset="utf-8"><title>Deno Mini Browser</title></head>
        <body style="font-family:system-ui;padding:20px">
          <h2>Type a name / search term</h2>
          <form method="POST" action="/search">
            <input name="q" placeholder="Search term" style="width:60%;padding:8px" required>
            <select name="mode" style="padding:8px">
              <option value="link">Show extracted URL only</option>
              <option value="proxy">Show proxied page content</option>
            </select>
            <button type="submit" style="padding:8px 12px">Search</button>
          </form>
        </body>
      </html>
    `;
  })

  .post("/search", async (ctx) => {
    const body = ctx.request.body({ type: "form" });
    const value = await body.value;
    const q = value.get("q")?.trim() || "";
    const mode = value.get("mode") || "link";

    if (!q) {
      ctx.response.body = "Please provide a search term.";
      return;
    }

    try {
      const firstUrl = await getFirstResultUrl(q);
      if (!firstUrl) {
        ctx.response.body = `<p>No result found for <b>${escapeHtml(q)}</b>.</p><p><a href="/">Back</a></p>`;
        return;
      }

      if (mode === "link") {
        ctx.response.body = `
          <html><head><meta charset="utf-8"><title>Result for ${escapeHtml(q)}</title></head>
          <body style="font-family:system-ui;padding:20px">
            <h3>Top result for: ${escapeHtml(q)}</h3>
            <p><a href="${escapeHtml(firstUrl)}" target="_blank">${escapeHtml(firstUrl)}</a></p>
            <p><a href="/proxy?url=${encodeURIComponent(firstUrl)}" target="_blank">Open proxied</a></p>
            <p style="margin-top:18px"><a href="/">New search</a></p>
          </body></html>
        `;
      } else {
        try {
          const pageResp = await fetch(firstUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          const pageHtml = await pageResp.text();
          ctx.response.body = `
            <html>
              <head><meta charset="utf-8"><title>Proxied: ${escapeHtml(q)}</title></head>
              <body>
                <div style="padding:10px;background:#eee;border-bottom:1px solid #ccc">
                  <b>Search:</b> ${escapeHtml(q)} | <b>URL:</b> <a href="${escapeHtml(firstUrl)}" target="_blank">${escapeHtml(firstUrl)}</a>
                  &nbsp;|&nbsp; <a href="/">New search</a>
                </div>
                <div style="padding:12px">
                  ${pageHtml}
                </div>
              </body>
            </html>
          `;
        } catch (err) {
          ctx.response.body = `<p>Failed to fetch page: ${escapeHtml(err.message)}</p><p><a href="/">Back</a></p>`;
        }
      }
    } catch (err) {
      ctx.response.body = `<p>Error: ${escapeHtml(err.message)}</p><p><a href="/">Back</a></p>`;
    }
  })

  .get("/proxy", async (ctx) => {
    const url = ctx.request.url.searchParams.get("url");
    if (!url) {
      ctx.response.body = "Missing url parameter.";
      return;
    }
    try {
      const pageResp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      ctx.response.body = await pageResp.text();
    } catch (err) {
      ctx.response.body = `Failed to fetch: ${escapeHtml(err.message)}`;
    }
  });

app.use(router.routes());
app.use(router.allowedMethods());

console.log("Deno mini-browser running on http://localhost:8000");
await app.listen({ port: 8000 });
