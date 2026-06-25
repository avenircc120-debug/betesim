/**
 * Edge Function: pronostics
 * Actions publiques  : list-analyses, matches-list, package-get
 * Actions admin      : create-analysis, update-analysis, delete-analysis, admin-list,
 *                      matches-fetch, package-save, package-list
 * Actions partenaire : coupon-create, coupon-list, commission-list
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function isAdmin(supabase: any, userId: string | null, email: string | null) {
  const adminEnv = (Deno.env.get("ADMIN_EMAILS") ?? "").toLowerCase();
  if (email && adminEnv) {
    const list = adminEnv.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (list.includes(email.toLowerCase())) return true;
  }
  if (userId) {
    const { data } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
    if ((data as any)?.is_admin === true) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();

    // ── PUBLIC : liste des analyses publiées ─────────────────────────────────
    if (action === "list-analyses") {
      const { data } = await supabase
        .from("analyses")
        .select("id,title,team_home,team_away,league,country,match_date,prediction,confidence,odds,notes,result,created_at")
        .eq("published", true)
        .order("match_date", { ascending: false })
        .limit(50);
      return ok({ success: true, analyses: data ?? [] });
    }

    // ── PUBLIC : liste matchs football ───────────────────────────────────────
    if (action === "matches-list") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("football_matches")
        .select("*")
        .gte("match_date", since)
        .order("match_date", { ascending: true })
        .limit(50);
      return ok({ success: true, matches: data ?? [] });
    }

    // ── PUBLIC : chercher un package bookmaker pour des analyses sélectionnées ──
    if (action === "package-get") {
      const { analysis_ids, bookmaker } = body;
      if (!analysis_ids?.length) return ok({ success: false, error: "analysis_ids requis" });
      const now = new Date().toISOString();
      let query = supabase
        .from("bookmaker_packages")
        .select("*")
        .gt("expires_at", now);
      if (bookmaker) query = query.eq("bookmaker", bookmaker);
      const { data: packages } = await query.order("created_at", { ascending: false }).limit(50);
      // Trouver le package qui contient TOUTES les analyses sélectionnées
      const matching = (packages ?? []).find((pkg: any) =>
        (analysis_ids as string[]).every((id: string) => (pkg.analysis_ids as string[]).includes(id))
      );
      if (matching) return ok({ success: true, found: true, package: matching });
      return ok({ success: true, found: false });
    }

    // ── AUTH requis ──────────────────────────────────────────────────────────
    const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
    const { data: { user } } = await supabase.auth.getUser(token);
    const userId = user?.id ?? null;
    const email = user?.email ?? null;
    if (!userId) return ok({ success: false, error: "Non authentifié" }, 401);

    const admin = await isAdmin(supabase, userId, email);

    // ── ADMIN : liste complète (toutes analyses, même non publiées) ──────────
    if (action === "admin-list") {
      if (!admin) return ok({ success: false, error: "Accès refusé" }, 403);
      const { data } = await supabase
        .from("analyses").select("*").order("match_date", { ascending: false });
      return ok({ success: true, analyses: data ?? [] });
    }

    // ── ADMIN : sauvegarder un code bookmaker réel (1win/1xbet) ─────────────
    if (action === "package-save") {
      if (!admin) return ok({ success: false, error: "Accès refusé" }, 403);
      const { bookmaker, code, analysis_ids, total_odds, notes } = body;
      if (!bookmaker || !code || !analysis_ids?.length)
        throw new Error("Champs requis : bookmaker, code, analysis_ids");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.from("bookmaker_packages").insert({
        bookmaker,
        code: String(code).trim().toUpperCase(),
        analysis_ids,
        total_odds: total_odds ? Number(total_odds) : null,
        notes: notes ?? null,
        expires_at: expiresAt,
        created_by: email,
      }).select().single();
      if (error) throw new Error(error.message);
      return ok({ success: true, package: data });
    }

    // ── ADMIN : lister les packages bookmaker ────────────────────────────────
    if (action === "package-list") {
      if (!admin) return ok({ success: false, error: "Accès refusé" }, 403);
      const { data } = await supabase
        .from("bookmaker_packages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return ok({ success: true, packages: data ?? [] });
    }

    // ── ADMIN : créer une analyse ────────────────────────────────────────────
    if (action === "create-analysis") {
      if (!admin) return ok({ success: false, error: "Accès refusé" }, 403);
      const { title, team_home, team_away, league, country, match_date, prediction, confidence, odds, stats, notes } = body;
      if (!title || !team_home || !team_away || !prediction)
        throw new Error("Champs requis : title, team_home, team_away, prediction");
      const { data, error } = await supabase.from("analyses").insert({
        title, team_home, team_away,
        league: league ?? null, country: country ?? null,
        match_date: match_date ?? null,
        prediction,
        confidence: confidence ?? "moyen",
        odds: odds ? Number(odds) : null,
        stats: stats ?? {},
        notes: notes ?? null,
        published: true,
        source: "manual",
      }).select().single();
      if (error) throw new Error(error.message);
      return ok({ success: true, analysis: data });
    }

    // ── ADMIN : mettre à jour une analyse (résultat inclus) ──────────────────
    if (action === "update-analysis") {
      if (!admin) return ok({ success: false, error: "Accès refusé" }, 403);
      const { id, ...updates } = body;
      if (!id) throw new Error("id requis");
      const allowed = ["title","team_home","team_away","league","country","match_date","prediction","confidence","odds","stats","notes","result","published"];
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of allowed) { if (k in updates) patch[k] = (updates as any)[k]; }
      const { data, error } = await supabase.from("analyses").update(patch).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return ok({ success: true, analysis: data });
    }

    // ── ADMIN : supprimer une analyse ────────────────────────────────────────
    if (action === "delete-analysis") {
      if (!admin) return ok({ success: false, error: "Accès refusé" }, 403);
      const { id } = body;
      if (!id) throw new Error("id requis");
      const { error } = await supabase.from("analyses").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return ok({ success: true });
    }

    // ── ADMIN : déclencher le fetch de matchs ────────────────────────────────
    if (action === "matches-fetch") {
      if (!admin) return ok({ success: false, error: "Accès refusé" }, 403);
      const res = await supabase.functions.invoke("football-data", { body: { action: "fetch" } });
      return ok({ success: true, result: res.data });
    }

    // ── PARTENAIRE : créer un coupon ─────────────────────────────────────────
    if (action === "coupon-create") {
      const { analysis_id, code, label, price_fcfa } = body;
      if (!code) throw new Error("code requis");
      const codeClean = String(code).toUpperCase().replace(/[^A-Z0-9\-]/g, "").slice(0, 20);
      if (codeClean.length < 3) throw new Error("Code trop court (min 3 caractères alphanumériques)");
      const { data, error } = await supabase.from("coupons").insert({
        partner_id: userId,
        analysis_id: analysis_id ?? null,
        code: codeClean,
        label: label ?? null,
        price_fcfa: Number(price_fcfa ?? 500),
      }).select().single();
      if (error) throw new Error(error.message);
      return ok({ success: true, coupon: data });
    }

    // ── PARTENAIRE : lister ses coupons ──────────────────────────────────────
    if (action === "coupon-list") {
      const { data } = await supabase
        .from("coupons")
        .select("*, analyses(title,team_home,team_away,match_date,result)")
        .eq("partner_id", userId)
        .order("created_at", { ascending: false });
      return ok({ success: true, coupons: data ?? [] });
    }

    // ── PARTENAIRE : lister ses commissions ──────────────────────────────────
    if (action === "commission-list") {
      const { data } = await supabase
        .from("commission_records")
        .select("*")
        .eq("partner_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      const total = (data ?? []).reduce((s: number, r: any) => s + (r.commission_amount ?? 0), 0);
      return ok({ success: true, records: data ?? [], total_commission: total });
    }

    return ok({ success: false, error: "Action inconnue" }, 400);
  } catch (e: any) {
    console.error("pronostics error:", e?.message);
    return ok({ success: false, error: e?.message ?? "Erreur interne" }, 500);
  }
});
