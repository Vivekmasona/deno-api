// === Live Radio Signalling Server (Deno) ===
// Run: deno run --allow-net main.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Session {
  offer?: string;
  answer?: string;
}
const sessions = new Map<string, Session>();

console.log("✅ Live Radio Signalling Server running on :8000");

serve(async (req) => {
  const url = new URL(req.url);

  // --- Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const id = url.searchParams.get("id");
  if (!id) {
    return new Response("Missing id", {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // --- GET: fetch session
  if (req.method === "GET") {
    const s = sessions.get(id);
    return new Response(JSON.stringify(s || {}), {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    });
  }

  // --- POST: update session
  if (req.method === "POST") {
    const data = await req.json();
    let s = sessions.get(id);
    if (!s) s = {};
    if (data.offer) s.offer = data.offer;
    if (data.answer) s.answer = data.answer;
    sessions.set(id, s);

    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // --- Fallback
  return new Response("Not found", {
    status: 404,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}, { port: 8000 });
