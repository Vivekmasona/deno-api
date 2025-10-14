import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

async function getYtInfo(videoUrl: string) {
  try {
    // Fetch the video page
    const res = await fetch(videoUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
    const html = await res.text();

    // Extract ytInitialPlayerResponse JSON
    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
    if (!playerResponseMatch) throw new Error("Player response not found");

    const playerResponse = JSON.parse(playerResponseMatch[1]);

    // Get streamingData
    const streamingData = playerResponse.streamingData;
    if (!streamingData) throw new Error("No streamingData found");

    // Map formats to simplified structure
    const formats = (streamingData.formats || []).map((f: any) => ({
      itag: f.itag,
      quality: f.qualityLabel,
      mimeType: f.mimeType,
      url: f.url || null, // Some require deciphering
    }));

    const adaptiveFormats = (streamingData.adaptiveFormats || []).map((f: any) => ({
      itag: f.itag,
      quality: f.qualityLabel,
      mimeType: f.mimeType,
      url: f.url || null,
    }));

    return {
      status: "success",
      title: playerResponse.videoDetails?.title || "Unknown",
      videoId: playerResponse.videoDetails?.videoId,
      author: playerResponse.videoDetails?.author,
      durationSeconds: playerResponse.videoDetails?.lengthSeconds,
      formats,
      adaptiveFormats,
    };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

serve(async (req) => {
  const url = new URL(req.url);
  const videoUrl = url.searchParams.get("url");

  if (!videoUrl) {
    return new Response(JSON.stringify({ status: "error", message: "url param required" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const info = await getYtInfo(videoUrl);
  return new Response(JSON.stringify(info), {
    headers: { "Content-Type": "application/json" },
  });
});
