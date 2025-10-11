// 🦕 Deno Universal Extractor API
// Endpoints:
//   /ytdlp?url=YouTubeURL
//   /search?q=keyword
//   /igcdn?url=InstagramURL

Deno.serve(async (req) => {
  const { pathname, searchParams } = new URL(req.url);

  const headers = {
    "content-type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  // ---------------- Root ----------------
  if (pathname === "/") {
    return new Response(
      JSON.stringify(
        {
          status: "running",
          endpoints: {
            youtube_video: "/ytdlp?url=https://youtu.be/FkFvdukWpAI",
            youtube_search: "/search?q=hindi song",
            instagram_cdn: "/igcdn?url=https://www.instagram.com/reel/C4w8Qz6sHY9/",
          },
        },
        null,
        2
      ),
      { headers }
    );
  }

  // ---------------- YOUTUBE EXTRACTOR ----------------
  if (pathname === "/ytdlp") {
    const ytUrl = searchParams.get("url");
    if (!ytUrl) {
      return new Response(JSON.stringify({ error: "Missing ?url=" }), {
        headers,
        status: 400,
      });
    }

    try {
      const res = await fetch(ytUrl);
      const html = await res.text();

      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(" - YouTube", "") : "Unknown";

      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      const playerJson = playerMatch ? JSON.parse(playerMatch[1]) : null;

      const formats = playerJson?.streamingData?.formats || [];
      const adaptive = playerJson?.streamingData?.adaptiveFormats || [];

      const audio =
        adaptive.find((f: any) => f.mimeType.includes("audio")) ||
        formats.find((f: any) => f.mimeType.includes("audio"));

      const videoDetails = playerJson?.videoDetails || {};
      const microformat = playerJson?.microformat?.playerMicroformatRenderer || {};

      const channelName = videoDetails.author || "Unknown";
      const channelId = videoDetails.channelId || "Unknown";
      const thumbnails = videoDetails.thumbnail?.thumbnails || [];
      const publishDate = microformat.publishDate || "";
      const viewCount = videoDetails.viewCount || "0";
      const durationSeconds = parseInt(videoDetails.lengthSeconds || "0", 10);

      return new Response(
        JSON.stringify(
          {
            kind: "youtube#video",
            etag: "",
            id: videoDetails.videoId,
            snippet: {
              publishedAt: publishDate,
              channelId,
              title,
              description: videoDetails.shortDescription || "",
              thumbnails: {
                default: thumbnails[0] || {},
                medium: thumbnails[Math.floor(thumbnails.length / 2)] || {},
                high: thumbnails[thumbnails.length - 1] || {},
              },
              channelTitle: channelName,
            },
            contentDetails: {
              duration: `${durationSeconds}s`,
            },
            statistics: {
              viewCount,
            },
            streamingData: {
              audioUrl: audio?.url || "N/A",
              formatCount: formats.length + adaptive.length,
            },
          },
          null,
          2
        ),
        { headers }
      );
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        headers,
        status: 500,
      });
    }
  }

  // ---------------- YOUTUBE SEARCH (v3 style) ----------------
  if (pathname === "/search") {
    const query = searchParams.get("q");
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing ?q=" }), {
        headers,
        status: 400,
      });
    }

    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();

      const dataMatch = html.match(/ytInitialData\s*=\s*(\{.+?\});/s);
      if (!dataMatch) {
        return new Response(JSON.stringify({ error: "Could not parse search results" }), {
          headers,
        });
      }

      const initialData = JSON.parse(dataMatch[1]);
      const contents =
        initialData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents
          ?.flatMap((c: any) => c.itemSectionRenderer?.contents || []) || [];

      const items: any[] = [];

      for (const item of contents) {
        const video = item.videoRenderer;
        if (video) {
          const videoId = video.videoId;
          const title = video.title?.runs?.map((r: any) => r.text).join("") || "Unknown";
          const channelTitle =
            video.ownerText?.runs?.map((r: any) => r.text).join("") || "Unknown";
          const thumbnails = video.thumbnail?.thumbnails || [];
          const description =
            video.descriptionSnippet?.runs?.map((r: any) => r.text).join("") || "";

          items.push({
            kind: "youtube#searchResult",
            etag: "",
            id: { kind: "youtube#video", videoId },
            snippet: {
              title,
              description,
              channelTitle,
              thumbnails: {
                default: thumbnails[0] || {},
                medium: thumbnails[Math.floor(thumbnails.length / 2)] || {},
                high: thumbnails[thumbnails.length - 1] || {},
              },
            },
          });
        }
      }

      const response = {
        kind: "youtube#searchListResponse",
        etag: "",
        pageInfo: { totalResults: items.length, resultsPerPage: 20 },
        items: items.slice(0, 20),
      };

      return new Response(JSON.stringify(response, null, 2), { headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        headers,
        status: 500,
      });
    }
  }

  // ---------------- INSTAGRAM CDN ----------------
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

      // Try parsing <script type="application/ld+json">
      const jsonMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
      let jsonData = null;

      if (jsonMatch) {
        try {
          jsonData = JSON.parse(jsonMatch[1]);
        } catch {
          jsonData = null;
        }
      }

      // Fallback: window._sharedData
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

  // ---------------- 404 ----------------
  return new Response(JSON.stringify({ error: "404 Not Found" }), { headers, status: 404 });
});
