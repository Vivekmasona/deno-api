// main.ts
// Deno YouTube Extractor + yt-dlp + Cookies support
// Usage: 
// 1. POST /upload-cookies -> multipart form-data 'file': cookies.txt
// 2. GET /ytdl?url=https://youtu.be/VIDEOID

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { MultipartReader } from "https://deno.land/std@0.203.0/mime/multipart.ts";
import { v4 } from "https://deno.land/std@0.203.0/uuid/mod.ts";

const COOKIE_FOLDER = "./cookies";
await Deno.mkdir(COOKIE_FOLDER, { recursive: true });

serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname === "/upload-cookies") {
    try {
      const boundary = req.headers.get("content-type")?.split("boundary=")[1];
      if (!boundary) return json({ status: "error", message: "No boundary found" }, 400);

      const body = await req.arrayBuffer();
      const reader = new MultipartReader(new Deno.Buffer(body), boundary);
      const form = await reader.readForm();

      const file = form.file("file");
      if (!file) return json({ status: "error", message: "No file uploaded" }, 400);

      const filename = `${COOKIE_FOLDER}/${v4.generate()}.txt`;
      await Deno.writeFile(filename, await Deno.readFile(file.filename));
      return json({ status: "success", path: filename });
    } catch (err) {
      return json({ status: "error", message: err.message }, 500);
    }
  }

  if (req.method === "GET" && url.pathname === "/ytdl") {
    const videoUrl = url.searchParams.get("url");
    const cookieFile = url.searchParams.get("cookies"); // path to uploaded cookies.txt
    if (!videoUrl) return json({ status: "error", message: "Missing ?url=" }, 400);
    if (!cookieFile) return json({ status: "error", message: "Missing ?cookies=" }, 400);

    try {
      // Run yt-dlp to get JSON of all formats
      const p = Deno.run({
        cmd: [
          "yt-dlp",
          "-j", // JSON output
          "--cookies",
          cookieFile,
          videoUrl
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const output = await p.output();
      const raw = new TextDecoder().decode(output);
      const data = JSON.parse(raw);

      p.close();

      return json({
        status: "success",
        title: data.title,
        id: data.id,
        uploader: data.uploader,
        duration: data.duration,
        formats: data.formats
      });
    } catch (err) {
      return json({ status: "error", message: err.message }, 500);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
