// stream_server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let currentStream: ReadableStream<Uint8Array> | null = null;
let currentTitle = "";

serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/upload" && req.method === "POST") {
    const form = await req.formData();
    const file = form.get("file") as File;
    currentTitle = file.name;
    const reader = file.stream().getReader();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // background copy
    (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
        await new Promise(r => setTimeout(r, 20)); // throttle ≈ 40 kbps
      }
      writer.close();
    })();

    currentStream = readable;
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  if (url.pathname === "/stream") {
    if (!currentStream)
      return new Response("No live", { status: 404 });
    return new Response(currentStream, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "audio/mpeg",
      },
    });
  }

  if (url.pathname === "/status")
    return new Response(
      JSON.stringify({ live: !!currentStream, title: currentTitle }),
      { headers: { "Access-Control-Allow-Origin": "*" } },
    );

  return new Response("OK");
}, { port: 8000 });
