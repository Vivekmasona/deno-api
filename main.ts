// Deno Instagram CDN Extractor + YouTube Audio Extractor
// Example: 
// https://yourapp.deno.dev/insta?url=https://www.instagram.com/reel/C4w8Qz6sHY9/
// https://yourapp.deno.dev/search?q=hindi song
// https://yourapp.deno.dev/ytdlp?url=https://youtu.be/FkFvdukWpAI

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  if (pathname === "/") {
    return new Response("🦕 Deno Multi Extractor Running!\nUse /insta or /ytdlp or /search", {
      headers: { "content-type": "text/plain" },
    });
  }

  // 🔹 YouTube audio extractor
  if (pathname === "/ytdlp") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) return error("Missing ?url=");
    try {
      const html = await fetch(ytUrl).then(r => r.text());
      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (!playerMatch) return error("No ytInitialPlayerResponse found");

      const playerJson = JSON.parse(playerMatch[1]);
      const adaptive = playerJson.streamingData?.adaptiveFormats || [];
      const audio = adaptive.find((f: any) => f.mimeType.includes("audio"));

      return json({
        status: "success",
        title: playerJson.videoDetails?.title,
        channel: playerJson.videoDetails?.author,
        videoId: playerJson.videoDetails?.videoId,
        audioUrl: audio?.url,
      });
    } catch (e) {
      return error(e.message);
    }
  }

  // 🔹 YouTube search
  if (pathname === "/search") {
    const q = searchParams.get("q");
    if (!q) return error("Missing ?q=");
    try {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
      const html = await fetch(url).then(r => r.text());
      const match = html.match(/ytInitialData"\s*:\s*(\{.+?\})\s*<\/script>/s);
      if (!match) return error("Could not parse search results");

      const data = JSON.parse(match[1]);
      const items = data.contents
        ?.twoColumnSearchResultsRenderer
        ?.primaryContents
        ?.sectionListRenderer
        ?.contents?.[0]
        ?.itemSectionRenderer
        ?.contents || [];

      const results = items
        .map((i: any) => i.videoRenderer)
        .filter(Boolean)
        .map((v: any) => ({
          title: v.title?.runs?.[0]?.text,
          videoId: v.videoId,
          thumbnail: v.thumbnail?.thumbnails?.[0]?.url,
          channel: v.ownerText?.runs?.[0]?.text,
          url: `https://youtu.be/${v.videoId}`
        }));

      return json({ status: "success", count: results.length, results });
    } catch (e) {
      return error(e.message);
    }
  }

  // 🔹 Instagram CDN extractor
  if (pathname === "/insta") {
    const instaUrl = searchParams.get("url");
    if (!instaUrl) return error("Missing ?url=");

    try {
      const res = await fetch(instaUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      const html = await res.text();

      // JSON from window._sharedData
      const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
      if (!match) return error("Could not parse media info");

      const jsonData = JSON.parse(match[1]);
      const videoUrl = jsonData.video?.[0]?.contentUrl || jsonData.video?.contentUrl;
      const imageUrl = jsonData.image?.[0] || jsonData.image;
      const caption = jsonData.caption || jsonData.description;
      const author = jsonData.author?.name || "Unknown";

      return json({
        status: "success",
        type: videoUrl ? "video" : "image",
        author,
        caption,
        imageUrl,
        videoUrl
      });
    } catch (err) {
      return error(err.message);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// Utility helpers
function json(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" },
  });
}

function error(message: string) {
  return json({ status: "error", message });
}
