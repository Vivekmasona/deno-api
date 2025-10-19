// deno run --allow-net main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const sessions = new Map<string, any>();

serve((req) => {
  const url = new URL(req.url);
  if (req.method === "POST" && url.pathname === "/signal") {
    return req.json().then((data) => {
      const { session, role, sdp } = data;
      if (!session) return new Response("no session", { status: 400 });

      if (role === "offer") {
        sessions.set(session, { offer: sdp });
        return new Response("ok");
      } else if (role === "answer") {
        const existing = sessions.get(session);
        if (existing) existing.answer = sdp;
        sessions.set(session, existing);
        return new Response("ok");
      }
      return new Response("bad role", { status: 400 });
    });
  }

  if (req.method === "GET" && url.pathname.startsWith("/signal")) {
    const session = url.searchParams.get("session");
    const role = url.searchParams.get("role");
    const data = sessions.get(session);
    if (!data) return new Response("none");
    if (role === "offer" && data.offer) return new Response(JSON.stringify(data.offer));
    if (role === "answer" && data.answer) return new Response(JSON.stringify(data.answer));
    return new Response("wait");
  }

  return new Response("ok");
});
