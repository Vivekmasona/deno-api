// 🦕 Deno Instagram CDN Extractor
// Example: https://yourapp.deno.dev/insta?url=https://www.instagram.com/reel/C4w8Qz6sHY9/

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  // Root message
  if (pathname === "/") {
    return new Response("🦕 Instagram CDN Extractor Running!\nUse /insta?url=", {
      headers: { "content-type": "text/plain" },
    });
  }

  // ✅ Instagram Extractor
  if (pathname === "/insta") {
    const instaUrl = searchParams.get("url");
    if (!instaUrl) return error("Missing ?url=");

    try {
      const res = await fetch(instaUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const html = await res.text();

      // Try to extract from multiple possible script blocks
      const match =
        html.match(/window\.__additionalDataLoaded\('.*?',(.*?)\);<\/script>/s) ||
        html.match(/window\.__initialDataLoaded\((.*?)\);<\/script>/s) ||
        html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);

      if (!match) return error("Could not parse media info");

      const jsonText = match[1];
      const data = JSON.parse(jsonText);

      // Handle Instagram’s new data structures
      const media =
        data.graphql?.shortcode_media ||
        data.entry_data?.PostPage?.[0]?.graphql?.shortcode_media ||
        data.video ||
        data.image ||
        null;

      if (!media) return error("Media info missing in parsed data");

      // Extract media details
      const videoUrl = media.video_url || media.video?.contentUrl || null;
      const imageUrl = media.display_url || media.image || null;
      const caption =
        media.edge_media_to_caption?.edges?.[0]?.node?.text ||
        media.caption ||
        media.title ||
        "";
      const username = media.owner?.username || data.author?.name || "Unknown";
      const profilePic = media.owner?.profile_pic_url || null;
      const isVideo = !!videoUrl;

      // Final JSON output
      return json({
        status: "success",
        type: isVideo ? "video" : "image",
        username,
        caption,
        imageUrl,
        videoUrl,
        profilePic,
      });
    } catch (err) {
      return error(err.message);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// Helper functions
function json(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" },
  });
}

function error(message: string) {
  return json({ status: "error", message });
}
