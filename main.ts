// Deno Instagram CDN Extractor
// Example: /igcdn?url=https://www.instagram.com/reel/C4w8Qz6sHY9/

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  const headers = {
    "content-type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (pathname === "/") {
    return new Response(
      JSON.stringify({ status: "running", message: "Use /igcdn?url=..." }, null, 2),
      { headers }
    );
  }

  // ---------------- INSTAGRAM CDN FETCH ----------------
  if (pathname === "/igcdn") {
    const igUrl = searchParams.get("url");
    if (!igUrl) {
      return new Response(JSON.stringify({ error: "Missing ?url=" }), { headers, status: 400 });
    }

    try {
      const res = await fetch(igUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const html = await res.text();

      // Try parsing the JSON embedded in ld+json
      const jsonMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
      let jsonData = null;

      if (jsonMatch) {
        try {
          jsonData = JSON.parse(jsonMatch[1]);
        } catch {
          jsonData = null;
        }
      }

      // If ld+json failed, try window._sharedData
      if (!jsonData) {
        const sharedMatch = html.match(/window\._sharedData\s*=\s*(\{.+?\});/s);
        if (sharedMatch) {
          const sharedData = JSON.parse(sharedMatch[1]);
          const media =
            sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media || null;
          if (media) {
            jsonData = {
              "@type": media.is_video ? "VideoObject" : "ImageObject",
              name: media.edge_media_to_caption?.edges?.[0]?.node?.text || "",
              thumbnailUrl: media.display_url,
              contentUrl: media.video_url || media.display_url,
              author: {
                username: media.owner?.username,
                profilePic: media.owner?.profile_pic_url,
              },
            };
          }
        }
      }

      if (!jsonData) {
        return new Response(JSON.stringify({ error: "Could not parse media info" }), { headers });
      }

      // Standardized response
      const response = {
        status: "success",
        type: jsonData["@type"] === "VideoObject" ? "video" : "image",
        title: jsonData.name || "Instagram Media",
        thumbnail: jsonData.thumbnailUrl,
        cdn_url: jsonData.contentUrl,
        author: jsonData.author || {},
      };

      return new Response(JSON.stringify(response, null, 2), { headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { headers, status: 500 });
    }
  }

  return new Response(JSON.stringify({ error: "404 Not Found" }), { headers, status: 404 });
});
