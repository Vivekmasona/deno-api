// 🦕 Deno Instagram Video Search (Reels / Hashtags)
// Example: https://yourapp.deno.dev/instasearch?q=hindi+song

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  // Root info
  if (pathname === "/") {
    return new Response("🦕 Instagram Video Search API\nUse /instasearch?q=", {
      headers: { "content-type": "text/plain" },
    });
  }

  // ✅ Instagram Video Search
  if (pathname === "/instasearch") {
    const query = searchParams.get("q");
    if (!query) return error("Missing ?q=");

    try {
      // We use tag/explore search since Instagram search pages are blocked
      const searchUrl = `https://www.instagram.com/web/search/topsearch/?context=blended&query=${encodeURIComponent(
        query
      )}&include_reel=true`;
      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const json = await res.json();

      // Instagram sometimes returns users + hashtags + places
      const reels: any[] = [];

      if (json?.users?.length) {
        for (const user of json.users.slice(0, 5)) {
          const username = user.user.username;
          const reelUrl = `https://www.instagram.com/${username}/reels/`;
          reels.push({
            username,
            profile_pic_url: user.user.profile_pic_url,
            reelUrl,
            type: "userReels",
          });
        }
      }

      if (json?.hashtags?.length) {
        for (const tag of json.hashtags.slice(0, 5)) {
          const name = tag.hashtag.name;
          const tagUrl = `https://www.instagram.com/explore/tags/${name}/`;
          reels.push({
            hashtag: `#${name}`,
            postCount: tag.hashtag.media_count,
            exploreUrl: tagUrl,
            type: "hashtag",
          });
        }
      }

      // Clean response
      return jsonRes({
        status: "success",
        query,
        total: reels.length,
        results: reels,
      });
    } catch (err) {
      return error(err.message);
    }
  }

  return new Response("404 Not Found", { status: 404 });
});

// Helper functions
function jsonRes(obj: any) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
function error(message: string) {
  return jsonRes({ status: "error", message });
}
