// main.ts — Deno Deploy compatible
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

let lastYtid = "";
let lastUpdate = Date.now();

// ✅ Helper to send JSON response with CORS
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
    },
  });
}

// ✅ Helper to send plain text with CORS
function textResponse(text: string, status = 200) {
  return new Response(text, {
    status,
    headers: {
      "content-type": "text/plain",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
    },
  });
}

serve(async (req) => {
  const url = new URL(req.url);

  // Handle preflight CORS
  if (req.method === "OPTIONS") {
    return textResponse("ok");
  }

  // 🟢 Upload route
  if (url.pathname === "/upload" && req.method === "POST") {
    try {
      const body = await req.json();
      if (body.Ytid) {
        lastYtid = body.Ytid;
        lastUpdate = Date.now();
        console.log("📥 Ytid uploaded:", lastYtid);
        return jsonResponse({ success: true, Ytid: lastYtid });
      } else {
        return jsonResponse({ success: false, error: "Missing Ytid" }, 400);
      }
    } catch (err) {
      console.error("❌ JSON error:", err);
      return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
    }
  }

  // 🟢 Check route
  if (url.pathname === "/check") {
    if (lastYtid) {
      return textResponse(
        `✅ Current Ytid: ${lastYtid}\nUpdated: ${new Date(lastUpdate).toLocaleString()}`
      );
    } else {
      return textResponse("⚠️ No Ytid uploaded yet.");
    }
  }

  // 🟢 WebSocket route (optional)
  if (url.pathname === "/ws" && req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = () => console.log("🔌 WebSocket connected");
    socket.onmessage = (ev) => console.log("📨 WS:", ev.data);
    return response;
  }

  // 🟢 Default
  return textResponse("🎧 API online: use /upload or /check");
});
