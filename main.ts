// === Deno FM CDN Stream API ===
// Deploy at: https://vfy-call.deno.dev
// Handles small audio chunks (binary) from broadcaster and updates playlist for CDN use

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface Segment {
  name: string;
  data: Uint8Array;
}

let segments: Segment[] = [];
const MAX_SEGMENTS = 10; // keep last 10 (~10s if 1s each)

function m3u8() {
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:1",
    `#EXT-X-MEDIA-SEQUENCE:${Math.max(0, segments.length - MAX_SEGMENTS)}`
  ];
  for (const seg of segments.slice(-MAX_SEGMENTS)) {
    lines.push("#EXTINF:1.0,");
    lines.push(`${seg.name}`);
  }
  return lines.join("\n");
}

serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // --- CORS ---
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  // === Playlist request ===
  if (path === "/live/playlist.m3u8") {
    return new Response(m3u8(), {
      headers: { ...headers, "Content-Type": "application/vnd.apple.mpegurl" },
    });
  }

  // === Segment GET ===
  if (path.startsWith("/live/")) {
    const name = path.replace("/live/", "");
    const seg = segments.find((s) => s.name === name);
    if (seg) {
      return new Response(seg.data, {
        headers: { ...headers, "Content-Type": "audio/aac" },
      });
    } else {
      return new Response("Not Found", { status: 404, headers });
    }
  }

  // === Segment upload (broadcaster) ===
  if (path === "/upload" && req.method === "POST") {
    const data = new Uint8Array(await req.arrayBuffer());
    const name = `seg_${Date.now()}.aac`;
    segments.push({ name, data });
    if (segments.length > MAX_SEGMENTS) segments.shift();
    return new Response("ok", { headers });
  }

  return new Response("🎧 Deno FM Stream API active", { headers });
});
