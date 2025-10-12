// main.ts
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

// === HARDCODED BOT TOKEN ===
const BOT_TOKEN = "8149225352:AAF8pkM10sed_Yzkxz51gfyszDcQuXV1mgg";
// ===========================

// Webhook path (public URL me ye path match hona chahiye)
const WEBHOOK_PATH = "/"; // simple root path for public hosting

async function sendReply(chatId: number | string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error("sendReply error:", err);
  }
}

console.log("Starting Telegram webhook bot...");

serve(async (req) => {
  try {
    const url = new URL(req.url);

    // Only accept POST at webhook path
    if (req.method === "POST" && url.pathname === WEBHOOK_PATH) {
      const body = await req.json().catch(() => null);
      if (!body) return new Response("Bad Request", { status: 400 });

      const msg = body.message;
      if (msg && typeof msg.text === "string") {
        const from = msg.from ?? {};
        const name = from.first_name ?? from.username ?? "there";
        const replyText = `Welcome to hack world — ${name} ke sath aaya message`;
        // reply asynchronously
        sendReply(msg.chat.id, replyText).catch(console.error);
      }

      return new Response("OK", { status: 200 });
    }

    // Health check
    if (req.method === "GET") {
      return new Response(
        "Telegram bot running. POST updates to this URL",
        { status: 200 },
      );
    }

    return new Response("Method Not Allowed", { status: 405 });
  } catch (err) {
    console.error("Server error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
