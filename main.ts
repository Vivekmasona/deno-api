// stream_server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let currentStream: ReadableStream<Uint8Array> | null = null;

console.log("🎧 Deno FM Live Stream Server running...");

// Helper: CORS headers
function corsHeaders(extra: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range, Origin, Accept",
    ...extra,
  };
}

serve(async (req) => {
  const url = new URL(req.url);

  // Preflight CORS check
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  // Broadcaster upload
  if (req.method === "POST" && url.pathname === "/upload") {
    const body = req.body;
    if (!body)
      return new Response("Missing body", {
        status: 400,
        headers: corsHeaders(),
      });

    console.log("🎙️ Broadcaster connected, streaming started...");

    const { readable, writable } = new TransformStream();
    currentStream = readable;

    const writer = writable.getWriter();
    const reader = body.getReader();

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writer.write(value);
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        writer.close();
        currentStream = null;
        console.log("🛑 Stream ended.");
      }
    })();

    return new Response("OK", { headers: corsHeaders() });
  }

  // Listener stream
  if (req.method === "GET" && url.pathname === "/listen") {
    if (!currentStream) {
      return new Response("No live stream", {
        status: 404,
        headers: corsHeaders(),
      });
    }

    console.log("🎧 Listener joined stream");

    const headers = corsHeaders({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked",
    });

    return new Response(currentStream, { headers });
  }

  // Default response
  return new Response("✅ FM Streaming Server Active", {
    headers: corsHeaders(),
  });
});
