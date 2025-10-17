// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface DeviceData {
  id: string;
  Ytid: string;
  lat: number;
  lon: number;
  last: number;
}

const devices = new Map<string, DeviceData>();

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
  };
}

// haversine distance (in meters)
function distance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });

  // 🟢 Upload location + Ytid
  if (url.pathname === "/upload" && req.method === "POST") {
    try {
      const body = await req.json();
      const id = body.device || crypto.randomUUID();
      const Ytid = body.Ytid;
      const lat = Number(body.lat);
      const lon = Number(body.lon);
      if (!Ytid || Ytid.length !== 11)
        return new Response(JSON.stringify({ success: false, error: "Invalid Ytid" }), {
          status: 400,
          headers: { "content-type": "application/json", ...cors() },
        });

      devices.set(id, { id, Ytid, lat, lon, last: Date.now() });

      // proximity match
      let nearbyYtid: string | null = null;
      for (const [otherId, d] of devices.entries()) {
        if (otherId === id) continue;
        const dist = distance(lat, lon, d.lat, d.lon);
        if (dist <= 100) {
          nearbyYtid = d.Ytid;
          break;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          device: id,
          nearby: nearbyYtid,
        }),
        { headers: { "content-type": "application/json", ...cors() } },
      );
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { "content-type": "application/json", ...cors() },
      });
    }
  }

  // 🟢 Check all (debug)
  if (url.pathname === "/check") {
    return new Response(JSON.stringify(Array.from(devices.values()), null, 2), {
      headers: { "content-type": "application/json", ...cors() },
    });
  }

  return new Response("🎧 Geo-share server active", { headers: cors() });
});
