// === VFY FM Live Audio Stream Server ===
// Works on Deno Deploy
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let live = false;
let title = "";
let listeners: TransformStream<Uint8Array, Uint8Array>[] = [];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

console.log("🎧 Server Ready");

serve(async (req) => {
  const url = new URL(req.url);

  // Handle preflight
  if (req.method === "OPTIONS")
    return new Response(null, { headers: CORS });

  // === Upload from control ===
  if (url.pathname === "/upload" && req.method === "POST") {
    live = true;
    title = url.searchParams.get("title") || "Untitled";
    console.log("🎙️ Live started:", title);

    const reader = req.body?.getReader();
    if (!reader) return new Response("no body", { status: 400, headers: CORS });

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const l of listeners) {
            const writer = l.writable.getWriter();
            await writer.write(value);
            writer.releaseLock();
          }
          await new Promise(r => setTimeout(r, 33)); // ~30kbps pacing
        }
      } catch (err) {
        console.error(err);
      } finally {
        console.log("🛑 Live ended");
        live = false;
        title = "";
        listeners = [];
      }
    })();

    return new Response("Streaming...", { headers: CORS });
  }

  // === Listen stream ===
  if (url.pathname === "/listen") {
    const ts = new TransformStream<Uint8Array, Uint8Array>();
    listeners.push(ts);
    console.log("🎧 Listener joined:", listeners.length);

    return new Response(ts.readable, {
      headers: {
        ...CORS,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  }

  // === Status ===
  if (url.pathname === "/status") {
    return new Response(JSON.stringify({ live, title }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response("FM server online", { headers: CORS });
});
