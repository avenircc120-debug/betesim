Deno.serve(async (req) => {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return new Response("Token manquant", { status: 500 });

  const url = new URL(req.url);
  const webhookUrl = "https://mqwrhiffrtbkizyuiytt.supabase.co/functions/v1/telegram-bot";

  // Mode diagnostic seulement (sans modifier le webhook)
  if (url.searchParams.get("action") === "info") {
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const info = await infoRes.json();
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const me = await meRes.json();
    return new Response(JSON.stringify({ bot: me.result, webhook: info.result }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Mode fix : supprimer + redéfinir le webhook
  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const info = await infoRes.json();

  await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: false }),
  });

  const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message", "callback_query", "my_chat_member"],
      max_connections: 40,
    }),
  });
  const setJson = await setRes.json();

  // Vérifier après fix
  const afterRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const after = await afterRes.json();

  return new Response(JSON.stringify({
    avant: {
      url: info.result?.url,
      pending_update_count: info.result?.pending_update_count,
      last_error_message: info.result?.last_error_message,
      last_error_date: info.result?.last_error_date,
    },
    set_résultat: setJson,
    après: {
      url: after.result?.url,
      pending_update_count: after.result?.pending_update_count,
      last_error_message: after.result?.last_error_message,
    },
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
