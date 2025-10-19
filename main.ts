// deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const sessions = new Map<string, any>();

serve(async (req) => {
  const url = new URL(req.url);

  // ✅ CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Content-Type": "application/json",
  };

  // Preflight request (CORS)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  // === Store offer/answer ===
  if (req.method === "POST" && url.pathname === "/signal") {
    const { session, role, sdp } = await req.json();
    if (!session || !role || !sdp)
      return new Response(JSON.stringify({ error: "invalid data" }), {
        status: 400,
        headers,
      });

    let data = sessions.get(session) || {};
    if (role === "offer") data.offer = sdp;
    else if (role === "answer") data.answer = sdp;
    sessions.set(session, data);

    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  // === Fetch offer/answer ===
  if (req.method === "GET" && url.pathname === "/signal") {
    const session = url.searchParams.get("session");
    const role = url.searchParams.get("role");
    const data = sessions.get(session);
    if (!data) return new Response("{}", { headers });

    if (role === "offer" && data.offer)
      return new Response(JSON.stringify(data.offer), { headers });
    if (role === "answer" && data.answer)
      return new Response(JSON.stringify(data.answer), { headers });

    return new Response("{}", { headers });
  }

  // === Root check ===
  return new Response(JSON.stringify({ status: "Server running ✅" }), {
    headers,
  });
});
