// === Real-time FM Stream Server (30kbps bitrate + status) ===
// Deploy: https://vfy-call.deno.dev

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let listeners: ((chunk: Uint8Array) => void)[] = [];
let isStreaming = false;
let currentTitle = "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

console.log("🎧 VFY FM Stream Server running...");

serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // === Upload endpoint ===
  if (url.pathname === "/upload" && req.method === "POST") {
    const title = url.searchParams.get("title") || "Unknown Song";
    currentTitle = title;
    isStreaming = true;
    console.log(`🎙️ Now streaming: ${title}`);

    const reader = req.body?.getReader();
    if (!reader) return new Response("No stream", { status: 400, headers: cors });

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) for (const fn of listeners) fn(value);
          await new Promise(r => setTimeout(r, 33)); // throttle ~30kbps
        }
      } catch (err) {
        console.error("Stream error", err);
      } finally {
        isStreaming = false;
        listeners = [];
        currentTitle = "";
        console.log("🛑 Stream stopped");
      }
    })();

    return new Response("OK", { headers: cors });
  }

  // === Listener endpoint ===
  if (url.pathname === "/listen" && req.method === "GET") {
    const stream = new ReadableStream({
      start(controller) {
        const send = (chunk: Uint8Array) => controller.enqueue(chunk);
        listeners.push(send);
      },
      cancel() {
        listeners = listeners.filter(fn => fn !== controller.enqueue);
      }
    });

    const resHeaders = {
      ...cors,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked",
    };

    console.log("🎧 Listener connected");
    return new Response(stream, { headers: resHeaders });
  }

  // === Status endpoint ===
  if (url.pathname === "/status" && req.method === "GET") {
    return new Response(JSON.stringify({
      live: isStreaming,
      title: currentTitle,
    }), {
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  return new Response("FM Server Active", { headers: cors });
});
