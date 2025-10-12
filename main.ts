// main.ts
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

// === HARDCODED TOKEN (no env) ===
const BOT_TOKEN = "8149225352:AAF8pkM10sed_Yzkxz51gfyszDcQuXV1mgg";
// =================================

async function reply(chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

console.log("Bot server starting...");

serve(async (req) => {
  try {
    // Accept only POST (Telegram will POST updates)
    if (req.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return new Response("Bad Request", { status: 400 });

    // Only handle text messages
    const msg = body.message;
    if (msg && typeof msg.text === "string") {
      const from = msg.from ?? {};
      const name = from.first_name ?? from.username ?? "there";
      const text = `Welcome to hack world — ${name} ke sath aaya message`;

      // Fire-and-forget (we await to surface errors in logs)
      await reply(msg.chat.id, text);
    }

    // Always return 200 quickly so Telegram considers update delivered
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Server error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
