// fm_stream.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let globalController: ReadableStreamDefaultController<Uint8Array> | null = null;
let currentStream: ReadableStream<Uint8Array> | null = null;

console.log("🎧 Live FM server started on port 8000");

// Helper: universal CORS headers
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

serve(async (req) => {
  const url = new URL(req.url);

  // handle preflight
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // POST /upload  (broadcaster)
  if (url.pathname === "/upload" && req.method === "POST") {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    currentStream = readable;
    const writer = writable.getWriter();
    const reader = req.body?.getReader();

    console.log("🎙️ Stream upload started...");

    if (!reader)
      return new Response("No stream body", { status: 400, headers: cors });

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writer.write(value);
        }
      } catch (e) {
        console.error("stream error:", e);
      } finally {
        writer.close();
        currentStream = null;
        console.log("🛑 Stream ended.");
      }
    })();

    return new Response("OK", { headers: cors });
  }

  // GET /listen (listener)
  if (url.pathname === "/listen" && req.method === "GET") {
    if (!currentStream) {
      return new Response("No live stream", { status: 404, headers: cors });
    }

    const headers = {
      ...cors,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked",
    };

    console.log("🎧 Listener connected.");
    return new Response(currentStream.pipeThrough(new TransformStream()), { headers });
  }

  return new Response("FM Server active", { headers: cors });
}, { port: 8000 });
