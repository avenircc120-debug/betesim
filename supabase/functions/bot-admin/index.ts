import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN    = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

function badge(level: string): string {
  if (level === "error") return `<span class="badge badge-error">❌ ERROR</span>`;
  if (level === "warn")  return `<span class="badge badge-warn">⚠️ WARN</span>`;
  return `<span class="badge badge-info">ℹ️ INFO</span>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    timeZone: "Africa/Abidjan",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-admin-token") ?? "";

  if (!BOT_TOKEN || token !== BOT_TOKEN) {
    return new Response(
      `<html><body style="font-family:system-ui;background:#0f0f0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <div style="text-align:center">
          <div style="font-size:48px">🔒</div>
          <h2>Accès refusé</h2>
          <p style="color:#888">Paramètre <code>?token=</code> invalide ou manquant.</p>
        </div>
      </body></html>`,
      { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const levelFilter = url.searchParams.get("level") || "";
  const eventFilter = url.searchParams.get("event") || "";
  const limitParam  = parseInt(url.searchParams.get("limit") || "200");
  const limit       = Math.min(Math.max(limitParam, 10), 500);

  let query = supabase
    .from("bot_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (levelFilter && ["error", "warn", "info"].includes(levelFilter)) {
    query = query.eq("level", levelFilter);
  }
  if (eventFilter) {
    query = query.ilike("event", `%${eventFilter}%`);
  }

  const { data: logs, error } = await query;

  if (error) {
    return new Response(`DB error: ${error.message}`, { status: 500 });
  }

  const all = logs ?? [];
  const counts = { error: 0, warn: 0, info: 0 };
  for (const l of all) counts[l.level as keyof typeof counts]++;

  const statsQuery = await supabase
    .from("bot_logs")
    .select("level, created_at")
    .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  const today = statsQuery.data ?? [];
  const todayCounts = { error: 0, warn: 0, info: 0 };
  for (const l of today) todayCounts[l.level as keyof typeof todayCounts]++;

  const eventsQuery = await supabase
    .from("bot_logs")
    .select("event")
    .order("event");
  const uniqueEvents = [...new Set((eventsQuery.data ?? []).map((r: any) => r.event))];

  const rows = all.map((log: any) => {
    const detailsHtml = log.details
      ? `<details><summary>détails</summary><pre>${escHtml(JSON.stringify(log.details, null, 2))}</pre></details>`
      : "";
    return `
    <tr>
      <td style="white-space:nowrap;color:#888;font-size:13px">${formatDate(log.created_at)}</td>
      <td>${badge(log.level)}</td>
      <td><code style="color:#aaa;font-size:13px">${escHtml(log.event)}</code></td>
      <td style="color:#88aaff">${log.chat_id ?? "—"}</td>
      <td style="max-width:400px;word-break:break-word">${escHtml(log.message ?? "")}${detailsHtml}</td>
    </tr>`;
  }).join("");

  const eventOptions = uniqueEvents.map((e: any) =>
    `<option value="${escHtml(e)}" ${eventFilter === e ? "selected" : ""}>${escHtml(e)}</option>`
  ).join("");

  const baseUrl = `${url.origin}${url.pathname}?token=${encodeURIComponent(token)}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🤖 Bot Admin — Logs</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0d0d0d; color: #e0e0e0; }
    .header { background: #111; border-bottom: 1px solid #222; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
    .header h1 { font-size: 20px; font-weight: 700; }
    .header .sub { color: #666; font-size: 13px; margin-left: auto; }
    .content { padding: 24px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .stat { background: #161616; border: 1px solid #222; border-radius: 10px; padding: 16px 20px; }
    .stat .num { font-size: 32px; font-weight: 800; line-height: 1; }
    .stat .lbl { font-size: 13px; color: #666; margin-top: 4px; }
    .stat.error-stat .num { color: #ff4d4d; }
    .stat.warn-stat  .num { color: #ffaa00; }
    .stat.info-stat  .num { color: #44dd88; }
    .stat.total-stat .num { color: #aaaaff; }
    .filters { background: #161616; border: 1px solid #222; border-radius: 10px; padding: 16px; margin-bottom: 20px; display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
    .filters label { font-size: 13px; color: #888; display: block; margin-bottom: 4px; }
    select, input { background: #1e1e1e; border: 1px solid #333; color: #e0e0e0; border-radius: 6px; padding: 7px 12px; font-size: 14px; }
    .btn { background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 8px 18px; font-size: 14px; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #1d4ed8; }
    .btn-secondary { background: #333; color: #ccc; }
    .btn-secondary:hover { background: #444; }
    .refresh-badge { background: #1a3a1a; color: #44dd88; border-radius: 20px; padding: 4px 12px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; background: #111; border-radius: 10px; overflow: hidden; border: 1px solid #222; }
    thead { background: #191919; }
    th { padding: 10px 14px; text-align: left; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    td { padding: 9px 14px; border-bottom: 1px solid #1a1a1a; font-size: 14px; vertical-align: top; }
    tr:hover td { background: #161616; }
    .badge { display: inline-block; padding: 2px 9px; border-radius: 5px; font-size: 11px; font-weight: 700; }
    .badge-error { background: #3a0a0a; color: #ff4d4d; border: 1px solid #5a1a1a; }
    .badge-warn  { background: #3a2800; color: #ffaa00; border: 1px solid #5a4000; }
    .badge-info  { background: #0a2e1a; color: #44dd88; border: 1px solid #1a4e2a; }
    code { background: #1e1e1e; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
    details summary { cursor: pointer; color: #555; font-size: 12px; margin-top: 4px; }
    details summary:hover { color: #888; }
    pre { background: #0a0a0a; border: 1px solid #222; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 11px; color: #aaa; margin-top: 6px; white-space: pre-wrap; }
    .empty { text-align: center; padding: 60px; color: #444; }
    .countdown { color: #555; font-size: 12px; }
    #timer { font-weight: bold; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <span style="font-size:28px">🤖</span>
    <div>
      <h1>Bot Admin — Logs</h1>
      <div style="color:#666;font-size:13px">betesim · Supabase Edge Functions</div>
    </div>
    <div class="sub">
      <span class="refresh-badge">🔄 Auto-refresh dans <span id="timer">30</span>s</span>
    </div>
  </div>

  <div class="content">
    <!-- Stats -->
    <div class="stats">
      <div class="stat total-stat">
        <div class="num">${all.length}</div>
        <div class="lbl">Affiché (/${limit})</div>
      </div>
      <div class="stat error-stat">
        <div class="num">${todayCounts.error}</div>
        <div class="lbl">Erreurs (24h)</div>
      </div>
      <div class="stat warn-stat">
        <div class="num">${todayCounts.warn}</div>
        <div class="lbl">Warnings (24h)</div>
      </div>
      <div class="stat info-stat">
        <div class="num">${todayCounts.info}</div>
        <div class="lbl">Info (24h)</div>
      </div>
    </div>

    <!-- Filtres -->
    <form class="filters" method="GET">
      <input type="hidden" name="token" value="${escHtml(token)}">
      <div>
        <label>Niveau</label>
        <select name="level">
          <option value="">Tous</option>
          <option value="error" ${levelFilter === "error" ? "selected" : ""}>❌ Error</option>
          <option value="warn"  ${levelFilter === "warn"  ? "selected" : ""}>⚠️ Warn</option>
          <option value="info"  ${levelFilter === "info"  ? "selected" : ""}>ℹ️ Info</option>
        </select>
      </div>
      <div>
        <label>Événement</label>
        <select name="event">
          <option value="">Tous</option>
          ${eventOptions}
        </select>
      </div>
      <div>
        <label>Limite</label>
        <select name="limit">
          <option value="50"  ${limit === 50  ? "selected" : ""}>50</option>
          <option value="100" ${limit === 100 ? "selected" : ""}>100</option>
          <option value="200" ${limit === 200 ? "selected" : ""}>200</option>
          <option value="500" ${limit === 500 ? "selected" : ""}>500</option>
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <button type="submit" class="btn">🔍 Filtrer</button>
        <a href="${baseUrl}" class="btn btn-secondary">↺ Réinitialiser</a>
      </div>
    </form>

    <!-- Table -->
    ${all.length === 0
      ? `<div class="empty"><div style="font-size:48px">✅</div><br>Aucun log pour ces filtres.</div>`
      : `<table>
      <thead>
        <tr>
          <th>Horodatage</th>
          <th>Niveau</th>
          <th>Événement</th>
          <th>Chat ID</th>
          <th>Message / Détails</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`}
  </div>

  <script>
    let seconds = 30;
    const timerEl = document.getElementById('timer');
    setInterval(() => {
      seconds--;
      if (timerEl) timerEl.textContent = String(seconds);
      if (seconds <= 0) location.reload();
    }, 1000);
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
