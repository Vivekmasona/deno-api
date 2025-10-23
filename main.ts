// === BiharFM Stream Server (Deno Deploy) ===
// Single audio source → unlimited listeners
// Author: Vivek Singh (BiharFM)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Simple in-memory buffer (RAM based circular buffer)
let currentChunk: Uint8Array | null = null;

// Optional metadata
let meta = {
  title: "BiharFM Live",
  artist: "Unknown Artist",
  cover: "",
};

// Helper
function ok(text: string) {
  return new Response(text, { headers: { "content-type": "text/plain" } });
}

console.log("🚀 BiharFM Deno Stream Server is live...");

serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  // ✅ Upload audio chunks (broadcaster)
  if (pathname === "/upload" && req.method === "POST") {
    try {
      const body = new Uint8Array(await req.arrayBuffer());
      currentChunk = body;
      if (searchParams.get("title")) {
        meta = {
          title: searchParams.get("title") || meta.title,
          artist: searchParams.get("artist") || meta.artist,
          cover: searchParams.get("cover") || meta.cover,
        };
      }
      return ok("🎵 Chunk uploaded");
    } catch (e) {
      return new Response("Upload failed: " + e.message, { status: 500 });
    }
  }

  // ✅ Stream to listeners
  if (pathname === "/listen") {
    if (!currentChunk)
      return new Response("No live stream yet.", { status: 404 });
    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    return new Response(currentChunk, { headers });
  }

  // ✅ Metadata endpoint
  if (pathname === "/meta") {
    return new Response(JSON.stringify(meta), {
      headers: { "content-type": "application/json" },
    });
  }

  // ✅ Root info
  return ok("🎧 BiharFM Deno Stream Server Active!\n\n" +
    "POST /upload  - broadcaster upload\n" +
    "GET  /listen  - listeners stream audio\n" +
    "GET  /meta    - get current title/artist");
});
