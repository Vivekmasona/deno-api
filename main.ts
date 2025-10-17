// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface DeviceData {
  id: string;
  Ytid: string;
  updated: number;
}

const devices = new Map<string, DeviceData>();

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
  };
}

serve(async (req) => {
  const url = new URL(req.url);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  // 🟢 Upload endpoint
  if (url.pathname === "/upload" && req.method === "POST") {
    try {
      const body = await req.json();
      const deviceId = body.device || crypto.randomUUID(); // generate if missing
      const Ytid = body.Ytid || "";

      if (!Ytid || Ytid.length !== 11) {
        return new Response(JSON.stringify({ success: false, error: "Invalid Ytid" }), {
          status: 400,
          headers: { "content-type": "application/json", ...corsHeaders() },
        });
      }

      devices.set(deviceId, { id: deviceId, Ytid, updated: Date.now() });
      console.log(`📥 [${deviceId}] => ${Ytid}`);

      return new Response(JSON.stringify({ success: true, device: deviceId }), {
        headers: { "content-type": "application/json", ...corsHeaders() },
      });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { "content-type": "application/json", ...corsHeaders() },
      });
    }
  }

  // 🟢 Check endpoint (list all devices)
  if (url.pathname === "/check") {
    const all = Array.from(devices.values());
    return new Response(
      JSON.stringify({ count: all.length, devices: all }),
      { headers: { "content-type": "application/json", ...corsHeaders() } },
    );
  }

  // 🟢 Default info
  return new Response(
    "🎧 API running. POST /upload (device, Ytid), GET /check to see all.",
    { headers: corsHeaders() },
  );
});
