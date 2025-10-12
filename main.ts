// mod.ts
// Deno + Telegram webhook simple bot
// Behavior: reply -> "Welcome to hack world — <name> ke sath aaya message"

// ----------------- HARDCODED TOKEN (YOU PROVIDED) -----------------
const BOT_TOKEN = "8149225352:AAF8pkM10sed_Yzkxz51gfyszDcQuXV1mgg";
// -----------------------------------------------------------------

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN missing. Put it in the code.");
  Deno.exit(1);
}

// Optional: change this path if you want a custom webhook path
const WEBHOOK_PATH = "/telegram-webhook"; // use "/" or "/telegram-webhook"

async function sendMessage(chat_id: number | string, text: string) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = { chat_id, text };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("sendMessage failed:", res.status, t);
    }
  } catch (err) {
    console.error("sendMessage error:", err);
  }
}

async function handleUpdate(update: any) {
  try {
    if (!update) return;
    // handle messages only
    if (update.message && typeof update.message.text === "string") {
      const from = update.message.from ?? {};
      const name = (from.first_name ?? from.username ?? "there").toString();
      const replyText = `Welcome to hack world — ${name} ke sath aaya message`;
      await sendMessage(update.message.chat.id, replyText);
    } else {
      // ignore non-text or unsupported updates
      // (you can add handling for callback_query, inline_query, etc.)
    }
  } catch (err) {
    console.error("handleUpdate error:", err);
  }
}

// Quick health-check response and root info
function rootResponse() {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "Telegram webhook bot running. Use POST to " + WEBHOOK_PATH,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

console.log("Starting server. Waiting for Telegram updates...");

serve(async (req) => {
  try {
    const url = new URL(req.url);
    // Health check for GET
    if (req.method === "GET") {
      // Basic root or health
      if (url.pathname === "/" || url.pathname === "/health") {
        return rootResponse();
      }
      // If someone opens the webhook path via browser, show simple text
      if (url.pathname === WEBHOOK_PATH) {
        return new Response("OK - webhook endpoint (POST only)", { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }

    // Allow only POST to the webhook path
    if (req.method === "POST") {
      if (url.pathname !== WEBHOOK_PATH) {
        // Security: ignore POSTs to other paths (optional)
        console.warn("POST to unexpected path:", url.pathname);
        return new Response("Not Found", { status: 404 });
      }

      // Try parse JSON
      let body: any;
      try {
        body = await req.json();
      } catch (err) {
        console.error("Invalid JSON body:", err);
        return new Response("Bad Request", { status: 400 });
      }

      // Handle update asynchronously but we already have the body.
      // We will not block Telegram: still handleUpdate returns promise — but we await it here
      // to ensure logs show immediate errors. If you want faster 200, you can NOT await.
      handleUpdate(body).catch((e) => console.error("handleUpdate uncaught:", e));

      // Always return 200 quickly
      return new Response("OK", { status: 200 });
    }

    // Method not allowed
    return new Response("Method Not Allowed", { status: 405 });
  } catch (err) {
    console.error("Unhandled error in server:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
