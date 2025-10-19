// === FM Stream Server (multi file ready) ===
// Deploy on Deno Deploy: https://vfy-call.deno.dev

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let listeners: ((chunk: Uint8Array) => void)[] = [];
let isStreaming = false;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

console.log("🎧 FM Stream Server online...");

serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS")
    return new Response(null, { headers: cors });

  // === Broadcaster upload stream ===
  if (url.pathname === "/upload" && req.method === "POST") {
    if (!req.body) return new Response("No body", { status: 400, headers: cors });
    isStreaming = true;
    console.log("🎙️ Live stream started...");

    const reader = req.body.getReader();

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) for (const fn of listeners) fn(value);
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        isStreaming = false;
        listeners = [];
        console.log("🛑 Stream ended");
      }
    })();

    return new Response("OK", { headers: cors });
  }

  // === Listener endpoint ===
  if (url.pathname === "/listen" && req.method === "GET") {
    const body = new ReadableStream({
      start(controller) {
        const send = (chunk: Uint8Array) => controller.enqueue(chunk);
        listeners.push(send);
      },
      cancel() {
        listeners = listeners.filter((fn) => fn !== controller.enqueue);
      },
    });

    const headers = {
      ...cors,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked",
    };

    console.log("🎧 Listener joined");
    return new Response(body, { headers });
  }

  return new Response("FM Stream Server Active", { headers: cors });
});
