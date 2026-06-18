/**
 * Edge Function: bookmaker-packages
 * Gestion des codes bookmaker prêts à l'emploi (1win / 1xbet)
 * 
 * Actions publiques  : get  (cherche un package pour des analyses sélectionnées)
 * Actions admin      : save (enregistre un code bookmaker une fois pour tous)
 *                      list (liste les packages existants)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();

    // ── PUBLIC : chercher un package pour des analyses sélectionnées ──────────
    if (action === "get") {
      const { analysis_ids, bookmaker } = body;
      if (!analysis_ids?.length) return ok({ success: true, found: false });
      const now = new Date().toISOString();
      let query = supabase
        .from("bookmaker_packages")
        .select("*")
        .gt("expires_at", now);
      if (bookmaker) query = query.eq("bookmaker", bookmaker);
      const { data: packages } = await query.order("created_at", { ascending: false }).limit(50);
      const matching = (packages ?? []).find((pkg: any) =>
        (analysis_ids as string[]).every((id: string) => (pkg.analysis_ids as string[]).includes(id))
      );
      if (matching) return ok({ success: true, found: true, package: matching });
      return ok({ success: true, found: false });
    }

    // ── AUTH requis pour les actions admin ────────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return ok({ success: false, error: "Non authentifié" }, 401);

    // Vérifier si admin
    const adminEnv = (Deno.env.get("ADMIN_EMAILS") ?? "").toLowerCase();
    const adminList = adminEnv.split(",").map((s: string) => s.trim()).filter(Boolean);
    const isAdmin = adminList.includes((user.email ?? "").toLowerCase()) ||
      (await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle())
        .data?.is_admin === true;
    if (!isAdmin) return ok({ success: false, error: "Accès refusé" }, 403);

    // ── ADMIN : sauvegarder un code bookmaker réel ────────────────────────────
    if (action === "save") {
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
        created_by: user.email,
      }).select().single();
      if (error) throw new Error(error.message);
      return ok({ success: true, package: data });
    }

    // ── ADMIN : lister les packages ───────────────────────────────────────────
    if (action === "list") {
      const { data } = await supabase
        .from("bookmaker_packages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return ok({ success: true, packages: data ?? [] });
    }

    return ok({ success: false, error: "Action inconnue" }, 400);

  } catch (e: any) {
    return ok({ success: false, error: e?.message ?? "Erreur interne" }, 500);
  }
});
