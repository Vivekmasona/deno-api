// === VFY FM Real-Time Stream Server ===
// Deno Deploy ready

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let listeners: ReadableStreamDefaultController<Uint8Array>[] = [];
let live = false;
let title = "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

console.log("🎧 VFY FM Server Ready...");

serve(async (req) => {
  const url = new URL(req.url);

  // --- Preflight ---
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // --- Upload (broadcaster stream) ---
  if (url.pathname === "/upload" && req.method === "POST") {
    live = true;
    title = url.searchParams.get("title") || "Untitled Song";
    const reader = req.body?.getReader();
    console.log("🎙️ Live started:", title);

    if (!reader) return new Response("No body", { status: 400, headers: CORS });

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            // broadcast to all listeners
            listeners.forEach((ctrl) => ctrl.enqueue(value));
          }
          await new Promise((r) => setTimeout(r, 33)); // 30kbps limit
        }
      } catch (err) {
        console.error("Stream error", err);
      } finally {
        live = false;
        title = "";
        listeners.forEach((ctrl) => ctrl.close());
        listeners = [];
        console.log("🛑 Stream ended");
      }
    })();

    return new Response("Streaming...", { headers: CORS });
  }

  // --- Listen (listeners stream) ---
  if (url.pathname === "/listen") {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        listeners.push(controller);
      },
      cancel() {
        listeners = listeners.filter((c) => c !== controller);
      },
    });

    return new Response(stream, {
      headers: {
        ...CORS,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Transfer-Encoding": "chunked",
      },
    });
  }

  // --- Status ---
  if (url.pathname === "/status") {
    return new Response(JSON.stringify({ live, title }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // --- Default ---
  return new Response("✅ VFY FM Active", { headers: CORS });
});
