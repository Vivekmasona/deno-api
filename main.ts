import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let liveStream: TransformStream<Uint8Array> | null = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let currentTitle = "";

serve(async (req) => {
  const url = new URL(req.url);

  // === Allow CORS ===
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // === Upload endpoint (progressive write) ===
  if (url.pathname === "/upload" && req.method === "POST") {
    const title = url.searchParams.get("title") ?? "Live Stream";
    currentTitle = title;

    liveStream = new TransformStream();
    writer = liveStream.writable.getWriter();

    const reader = req.body?.getReader();
    if (!reader) return new Response("No stream", { status: 400 });

    // Copy upload to live stream progressively
    (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
        await new Promise(r => setTimeout(r, 15)); // throttle ~30–40 kbps
      }
      await writer.close();
      liveStream = null;
      writer = null;
      currentTitle = "";
    })();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // === Live stream output ===
  if (url.pathname === "/stream") {
    if (!liveStream)
      return new Response("No live stream", {
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    const { readable } = liveStream;
    return new Response(readable, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "audio/mpeg",
      },
    });
  }

  // === Status ===
  if (url.pathname === "/status") {
    return new Response(JSON.stringify({
      live: !!liveStream,
      title: currentTitle,
    }), {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  return new Response("FM server online", {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}, { port: 8000 });
