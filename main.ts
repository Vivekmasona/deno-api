// main.ts
// Deno YouTube Stream Server
// Usage: /stream?url=<youtube_url>

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname === "/") {
    return json({ status: "success", message: "Deno YouTube Stream Running! Use /stream?url=..." });
  }

  if (pathname === "/stream") {
    const ytUrl = url.searchParams.get("url");
    if (!ytUrl) return error("Missing ?url= parameter");

    try {
      // Run yt-dlp to get direct video URL
      const p = Deno.run({
        cmd: ["yt-dlp", "-f", "best", "-g", ytUrl],
        stdout: "piped",
        stderr: "piped",
      });

      const output = new TextDecoder().decode(await p.output());
      const errOutput = new TextDecoder().decode(await p.stderrOutput());
      p.close();

      if (errOutput) return error("yt-dlp error: " + errOutput.trim());
      const videoUrl = output.trim();
      if (!videoUrl) return error("Could not fetch direct video URL");

      return json({ status: "success", videoUrl });
    } catch (err) {
      return error(err.message);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// ---------------- Helpers ----------------
function json(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), { headers: { "Content-Type": "application/json" } });
}

function error(msg: string) {
  return json({ status: "error", message: msg });
}
