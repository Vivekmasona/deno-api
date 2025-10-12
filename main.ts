// mod.ts
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

// === HARDCODED TOKEN (user provided) ===
const BOT_TOKEN = "8149225352:AAF8pkM10sed_Yzkxz51gfyszDcQuXV1mgg";
// =======================================

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN missing.");
  Deno.exit(1);
}

async function handleUpdate(update: any) {
  try {
    if (!update) return;
    if (update.message && update.message.text) {
      const from = update.message.from || {};
      const name = from.first_name ?? from.username ?? "there";
      const replyText = `Welcome to hack world — ${name} ke sath aaya message`;

      const payload = {
        chat_id: update.message.chat.id,
        text: replyText,
      };

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
  } catch (err) {
    console.error("handleUpdate error:", err);
  }
}

serve(async (req) => {
  // Optionally check pathname if you want a custom path
  if (req.method === "POST") {
    try {
      const body = await req.json();
      // handle asynchronously so Telegram gets quick 200
      handleUpdate(body).catch(console.error);
      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("Invalid update body:", err);
      return new Response("Bad Request", { status: 400 });
    }
  }
  return new Response("Hello — Telegram webhook ready", { status: 200 });
});
