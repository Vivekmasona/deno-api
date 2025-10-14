// stream-proxy.ts (Deno)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
serve(async (req) => {
  const u = new URL(req.url);
  if (u.pathname !== "/stream") return new Response("Not Found", { status: 404 });
  const target = u.searchParams.get("url");
  if (!target) return new Response("Missing ?url", { status: 400 });

  const forward: Record<string,string> = {
    "User-Agent": req.headers.get("user-agent") ?? "Mozilla/5.0",
    "Referer": "https://www.youtube.com/",
  };
  const range = req.headers.get("range");
  if (range) forward["Range"] = range;

  const upstream = await fetch(target, { headers: forward });
  if (!upstream.ok) {
    const txt = await upstream.text().catch(()=>"");
    return new Response(JSON.stringify({ status:"error", upstreamStatus: upstream.status, snippet: txt.slice(0,300) }, null, 2), { status: 502, headers:{ "content-type":"application/json" }});
  }

  const headers = new Headers(upstream.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Expose-Headers", "*");
  return new Response(upstream.body, { status: upstream.status, headers });
});
