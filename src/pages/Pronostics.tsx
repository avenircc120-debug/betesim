import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart2, Plus, Trophy, Trash2, Edit2, Check, X, RefreshCw,
  ChevronDown, Calendar, Target, TrendingUp, Tag, Coins, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

type Confidence = "faible" | "moyen" | "fort";
type Result     = "gagné" | "perdu" | "nul" | "annulé" | "en_attente";

interface Analysis {
  id: string;
  title: string;
  team_home: string;
  team_away: string;
  league: string | null;
  country: string | null;
  match_date: string | null;
  prediction: string;
  confidence: Confidence;
  odds: number | null;
  notes: string | null;
  result: Result;
  created_at: string;
}

interface Coupon {
  id: string;
  code: string;
  label: string | null;
  price_fcfa: number;
  sold_count: number;
  status: string;
  analyses?: { title: string; team_home: string; team_away: string; result: string } | null;
}

interface CommissionRecord {
  id: string;
  type: string;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  description: string | null;
  created_at: string;
}

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  faible: "bg-red-500/15 text-red-600 border-red-400/30",
  moyen:  "bg-amber-500/15 text-amber-600 border-amber-400/30",
  fort:   "bg-green-500/15 text-green-600 border-green-400/30",
};

const RESULT_COLORS: Record<Result, string> = {
  gagné:       "bg-green-500/15 text-green-600",
  perdu:       "bg-red-500/15 text-red-600",
  nul:         "bg-gray-500/15 text-gray-600",
  annulé:      "bg-gray-400/15 text-gray-500",
  en_attente:  "bg-sky-500/15 text-sky-600",
};

const RESULT_LABELS: Record<Result, string> = {
  gagné: "✅ Gagné", perdu: "❌ Perdu", nul: "🟰 Nul",
  annulé: "🚫 Annulé", en_attente: "⏳ En attente",
};

function invoke(action: string, extra: Record<string, unknown> = {}, token?: string) {
  return supabase.functions.invoke("pronostics", {
    body: { action, ...extra },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

const Pronostics = () => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const isAdmin  = !!(profile as any)?.is_admin;
  const isPartner = !!(profile as any)?.is_partner;

  const [tab, setTab] = useState<"analyses" | "publier" | "coupons">("analyses");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Analysis | null>(null);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [resultTarget, setResultTarget] = useState<Analysis | null>(null);
  const [selectedResult, setSelectedResult] = useState<Result>("en_attente");
  const [showCouponForm, setShowCouponForm] = useState(false);

  // ─── Mode Telegram WebApp : plein écran immersif ──────────────────────
  // Quand la page est ouverte depuis le bot via le bouton Web App, on demande
  // à Telegram d'agrandir la fenêtre au maximum (expanded + fullscreen).
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      // Fullscreen API (Bot API 8.0+) — ignoré silencieusement sur anciens clients
      if (typeof tg.requestFullscreen === "function") tg.requestFullscreen();
      // Empêche la fermeture accidentelle par swipe-down
      if (typeof tg.disableVerticalSwipes === "function") tg.disableVerticalSwipes();
      if (typeof tg.enableClosingConfirmation === "function") tg.enableClosingConfirmation();
    } catch (e) {
      console.warn("Telegram WebApp init:", e);
    }
  }, []);

  const [form, setForm] = useState({
    title: "", team_home: "", team_away: "", league: "", country: "",
    match_date: "", prediction: "", confidence: "moyen" as Confidence,
    odds: "", notes: "",
  });
  const [couponForm, setCouponForm] = useState({ code: "", label: "", price_fcfa: "500", analysis_id: "" });

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  };

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: analyses = [], isLoading: loadingAnalyses } = useQuery<Analysis[]>({
    queryKey: ["analyses", isAdmin],
    queryFn: async () => {
      const token = await getToken();
      const action = isAdmin ? "admin-list" : "list-analyses";
      const { data } = await invoke(action, {}, token);
      return data?.analyses ?? [];
    },
    staleTime: 60_000,
  });

  const { data: coupons = [] } = useQuery<Coupon[]>({
    queryKey: ["coupons", user?.id],
    queryFn: async () => {
      const token = await getToken();
      const { data } = await invoke("coupon-list", {}, token);
      return data?.coupons ?? [];
    },
    enabled: isPartner && tab === "coupons",
    staleTime: 30_000,
  });

  const { data: commissions, data: commData } = useQuery({
    queryKey: ["commissions", user?.id],
    queryFn: async () => {
      const token = await getToken();
      const { data } = await invoke("commission-list", {}, token);
      return data ?? { records: [], total_commission: 0 };
    },
    enabled: isPartner && tab === "coupons",
    staleTime: 30_000,
  });

  const { data: footballMatches = [] } = useQuery({
    queryKey: ["football-matches"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("football-data", { body: { action: "list" } });
      return data?.matches ?? [];
    },
    enabled: isAdmin && tab === "publier",
    staleTime: 5 * 60_000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { data, error } = await invoke("create-analysis", {
        ...form,
        odds: form.odds ? Number(form.odds) : null,
        match_date: form.match_date || null,
      }, token);
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Erreur");
    },
    onSuccess: () => {
      toast.success("Analyse publiée !");
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      setShowForm(false);
      setForm({ title:"",team_home:"",team_away:"",league:"",country:"",match_date:"",prediction:"",confidence:"moyen",odds:"",notes:"" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateResultMutation = useMutation({
    mutationFn: async () => {
      if (!resultTarget) return;
      const token = await getToken();
      const { data } = await invoke("update-analysis", { id: resultTarget.id, result: selectedResult }, token);
      if (!data?.success) throw new Error(data?.error || "Erreur");
    },
    onSuccess: () => {
      toast.success("Résultat mis à jour !");
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      setShowResultDialog(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const { data } = await invoke("delete-analysis", { id }, token);
      if (!data?.success) throw new Error(data?.error || "Erreur");
    },
    onSuccess: () => {
      toast.success("Analyse supprimée");
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const fetchMatchesMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { data } = await invoke("matches-fetch", {}, token);
      if (!data?.success) throw new Error(data?.error || "Erreur fetch");
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`${d.saved} matchs mis à jour depuis ${d.source}`);
      queryClient.invalidateQueries({ queryKey: ["football-matches"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const importMatchMutation = useMutation({
    mutationFn: async (m: any) => {
      const token = await getToken();
      const date = m.match_date ? new Date(m.match_date).toISOString().slice(0,16) : "";
      const { data } = await invoke("create-analysis", {
        title: `${m.team_home} vs ${m.team_away}`,
        team_home: m.team_home, team_away: m.team_away,
        league: m.league, country: m.country,
        match_date: date || null,
        prediction: "À compléter",
        confidence: "moyen",
      }, token);
      if (!data?.success) throw new Error(data?.error || "Erreur");
    },
    onSuccess: () => {
      toast.success("Match importé comme analyse !");
      queryClient.invalidateQueries({ queryKey: ["analyses"] });
      setTab("analyses");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const couponMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { data } = await invoke("coupon-create", {
        ...couponForm,
        price_fcfa: Number(couponForm.price_fcfa),
        analysis_id: couponForm.analysis_id || null,
      }, token);
      if (!data?.success) throw new Error(data?.error || "Erreur");
    },
    onSuccess: () => {
      toast.success("Coupon créé !");
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      setShowCouponForm(false);
      setCouponForm({ code:"", label:"", price_fcfa:"500", analysis_id:"" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const winRate = () => {
    const done = analyses.filter(a => a.result !== "en_attente" && a.result !== "annulé");
    const won  = done.filter(a => a.result === "gagné");
    return done.length > 0 ? Math.round((won.length / done.length) * 100) : 0;
  };

  const tabs = [
    { id: "analyses", label: "Pronostics" },
    ...(isPartner ? [{ id: "coupons", label: "Mes Coupons" }] : []),
    ...(isAdmin   ? [{ id: "publier", label: "Publier" }] : []),
  ] as { id: string; label: string }[];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-4 px-4 pt-6">

        {/* Header */}
        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}>
          <h1 className="text-2xl font-bold text-foreground">Pronostics</h1>
          <p className="text-sm text-muted-foreground">Analyses de matchs · Commissions 20%</p>
        </motion.div>

        {/* Stats rapides */}
        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}
          className="grid grid-cols-3 gap-3">
          {[
            { label: "Analyses",   value: analyses.length, icon: BarChart2, color: "text-primary" },
            { label: "Taux réussite", value: `${winRate()}%`, icon: TrendingUp, color: "text-green-600" },
            { label: "En attente", value: analyses.filter(a=>a.result==="en_attente").length, icon: Target, color: "text-amber-600" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl bg-card p-3 text-center shadow-card">
              <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-2xl bg-muted p-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
                tab === t.id ? "bg-card shadow text-foreground" : "text-muted-foreground"
              }`}>{t.label}</button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ══ TAB ANALYSES ══════════════════════════════════════════════════ */}
          {tab === "analyses" && (
            <motion.div key="analyses" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="space-y-3">
              {loadingAnalyses ? (
                <div className="flex items-center justify-center py-10">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : analyses.length === 0 ? (
                <div className="rounded-2xl bg-card p-8 text-center shadow-card">
                  <BarChart2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-semibold text-foreground">Aucune analyse publiée</p>
                  <p className="text-xs text-muted-foreground mt-1">Les analyses de l'analyste apparaîtront ici.</p>
                </div>
              ) : analyses.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.04 }}
                  className="rounded-2xl bg-card shadow-card overflow-hidden">
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-sm truncate">{a.team_home} vs {a.team_away}</p>
                        <p className="text-[11px] text-muted-foreground">{a.league ?? ""}{a.country ? ` · ${a.country}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${CONFIDENCE_COLORS[a.confidence]}`}>
                          {a.confidence.toUpperCase()}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${RESULT_COLORS[a.result]}`}>
                          {RESULT_LABELS[a.result]}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Analyse</p>
                      <p className="text-sm text-foreground font-medium">{a.prediction}</p>
                      {a.odds && <p className="text-xs text-muted-foreground mt-1">Cote : <strong>{a.odds}</strong></p>}
                    </div>

                    {a.notes && (
                      <p className="text-xs text-muted-foreground italic leading-relaxed">{a.notes}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {a.match_date ? new Date(a.match_date).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : "Date TBD"}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setResultTarget(a); setSelectedResult(a.result); setShowResultDialog(true); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => { if(confirm("Supprimer cette analyse ?")) deleteMutation.mutate(a.id); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* ══ TAB PUBLIER (ADMIN) ═══════════════════════════════════════════ */}
          {tab === "publier" && isAdmin && (
            <motion.div key="publier" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="space-y-4">

              {/* Bouton nouvelle analyse */}
              <Button onClick={() => setShowForm(true)}
                className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow">
                <Plus className="h-4 w-4 mr-2" /> Publier une analyse
              </Button>

              {/* Matchs automatiques */}
              <div className="rounded-2xl bg-card p-4 shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-foreground text-sm">Matchs automatiques</p>
                    <p className="text-xs text-muted-foreground">Sources : TheSportsDB → OpenLigaDB → Alerte URGENT</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fetchMatchesMutation.mutate()}
                    disabled={fetchMatchesMutation.isPending} className="rounded-xl h-9">
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${fetchMatchesMutation.isPending ? "animate-spin" : ""}`} />
                    Actualiser
                  </Button>
                </div>
                {footballMatches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">Cliquez sur Actualiser pour récupérer les matchs</p>
                ) : footballMatches.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{m.team_home} vs {m.team_away}</p>
                      <p className="text-[11px] text-muted-foreground">{m.league} · {m.match_date ? new Date(m.match_date).toLocaleDateString("fr-FR") : "?"}</p>
                    </div>
                    <button onClick={() => importMatchMutation.mutate(m)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 shrink-0">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ══ TAB COUPONS (PARTENAIRE) ══════════════════════════════════════ */}
          {tab === "coupons" && isPartner && (
            <motion.div key="coupons" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="space-y-4">

              {/* Résumé commissions */}
              <div className="rounded-2xl bg-amber-500/10 border border-amber-400/30 p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 shrink-0">
                  <Coins className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-foreground text-sm">Commissions prélevées (20%)</p>
                  <p className="text-xl font-bold text-amber-600">
                    {((commData as any)?.total_commission ?? 0).toLocaleString("fr-FR")} FCFA
                  </p>
                  <p className="text-[11px] text-muted-foreground">Sur ventes coupons + retraits</p>
                </div>
              </div>

              <Button onClick={() => setShowCouponForm(true)}
                className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow">
                <Tag className="h-4 w-4 mr-2" /> Créer un coupon
              </Button>

              {coupons.length === 0 ? (
                <div className="rounded-2xl bg-card p-6 text-center shadow-card">
                  <Tag className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="font-semibold text-foreground">Aucun coupon créé</p>
                  <p className="text-xs text-muted-foreground mt-1">Créez un code coupon lié à une analyse pour vos clients.</p>
                </div>
              ) : coupons.map((c, i) => (
                <motion.div key={c.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.04 }}
                  className="rounded-2xl bg-card shadow-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-primary/10 px-3 py-1 text-sm font-bold font-mono text-primary">{c.code}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.status==="active"?"bg-green-500/15 text-green-600":"bg-gray-500/15 text-gray-500"}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="font-bold text-foreground">{c.price_fcfa.toLocaleString("fr-FR")} FCFA</p>
                  </div>
                  {c.label && <p className="text-xs text-muted-foreground">{c.label}</p>}
                  {c.analyses && (
                    <p className="text-[11px] text-muted-foreground">
                      Match : {c.analyses.team_home} vs {c.analyses.team_away}
                      {" · "}<span className={`font-semibold ${RESULT_COLORS[c.analyses.result as Result]?.split(" ")[1]}`}>{RESULT_LABELS[c.analyses.result as Result]}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">{c.sold_count} vente{c.sold_count!==1?"s":""}</p>
                </motion.div>
              ))}

              {/* Historique commissions */}
              {(commData as any)?.records?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Historique</p>
                  {((commData as any).records as CommissionRecord[]).map(r => (
                    <div key={r.id} className="rounded-xl bg-card p-3 flex items-center gap-3 shadow-card">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 shrink-0">
                        {r.type==="withdrawal" ? <TrendingUp className="h-4 w-4 text-amber-600"/> : <Tag className="h-4 w-4 text-amber-600"/>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{r.description ?? (r.type==="withdrawal"?"Retrait":"Vente coupon")}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("fr-FR")}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-amber-600">-{r.commission_amount.toLocaleString("fr-FR")} F</p>
                        <p className="text-[10px] text-muted-foreground">net: {r.net_amount.toLocaleString("fr-FR")} F</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
      <BottomNav />

      {/* ── Dialog : Publier une analyse ───────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary"/>Nouvelle analyse</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[
              { key:"title",       label:"Titre",          placeholder:"Ex: PSG vs OM — Match décisif" },
              { key:"team_home",   label:"Équipe domicile", placeholder:"Ex: PSG" },
              { key:"team_away",   label:"Équipe extérieur",placeholder:"Ex: OM" },
              { key:"league",      label:"Compétition",     placeholder:"Ex: Ligue 1" },
              { key:"country",     label:"Pays",            placeholder:"Ex: France" },
              { key:"prediction",  label:"Analyse / Pronostic", placeholder:"Ex: Victoire PSG — Paris dominant à domicile" },
              { key:"odds",        label:"Cote (optionnel)", placeholder:"Ex: 1.85" },
            ].map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{f.label}</label>
                <Input value={(form as any)[f.key]} onChange={e => setForm(p=>({...p,[f.key]:e.target.value}))}
                  placeholder={f.placeholder} className="rounded-xl h-10" />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Date du match</label>
              <Input type="datetime-local" value={form.match_date} onChange={e=>setForm(p=>({...p,match_date:e.target.value}))} className="rounded-xl h-10"/>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Confiance</label>
              <div className="flex gap-2">
                {(["faible","moyen","fort"] as Confidence[]).map(c => (
                  <button key={c} onClick={()=>setForm(p=>({...p,confidence:c}))}
                    className={`flex-1 rounded-xl py-2 text-xs font-bold border transition-all ${form.confidence===c ? CONFIDENCE_COLORS[c] : "border-border bg-muted text-muted-foreground"}`}>
                    {c.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Notes / Stats (optionnel)</label>
              <textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
                rows={3} placeholder="Contexte, statistiques, informations clés..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.title || !form.team_home || !form.team_away || !form.prediction}
              className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold">
              {createMutation.isPending ? "Publication..." : "Publier l'analyse"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Mettre à jour le résultat ────────────────────────────── */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary"/>Résultat</DialogTitle></DialogHeader>
          {resultTarget && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">{resultTarget.team_home} vs {resultTarget.team_away}</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(RESULT_LABELS) as [Result, string][]).map(([r, label]) => (
                  <button key={r} onClick={()=>setSelectedResult(r)}
                    className={`rounded-xl py-2.5 text-xs font-bold border transition-all ${selectedResult===r ? RESULT_COLORS[r]+" border-current" : "border-border bg-muted text-muted-foreground"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <Button onClick={() => updateResultMutation.mutate()} disabled={updateResultMutation.isPending}
                className="h-11 w-full rounded-xl gradient-primary text-primary-foreground font-bold">
                {updateResultMutation.isPending ? "Mise à jour..." : "Enregistrer"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Créer un coupon ───────────────────────────────────────── */}
      <Dialog open={showCouponForm} onOpenChange={setShowCouponForm}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-primary"/>Nouveau coupon</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">20% de commission sera prélevée sur chaque vente de ce coupon.</p>
            </div>
            {[
              { key:"code",   label:"Code coupon", placeholder:"Ex: PRONO2024" },
              { key:"label",  label:"Description", placeholder:"Ex: Analyse PSG vs OM" },
              { key:"price_fcfa", label:"Prix (FCFA)", placeholder:"500" },
            ].map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{f.label}</label>
                <Input value={(couponForm as any)[f.key]} onChange={e=>setCouponForm(p=>({...p,[f.key]:e.target.value}))}
                  placeholder={f.placeholder} className="rounded-xl h-10"
                  type={f.key==="price_fcfa"?"number":"text"} />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Lier à une analyse (optionnel)</label>
              <div className="relative">
                <select value={couponForm.analysis_id} onChange={e=>setCouponForm(p=>({...p,analysis_id:e.target.value}))}
                  className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Aucune analyse liée</option>
                  {analyses.filter(a=>a.result==="en_attente").map(a=>(
                    <option key={a.id} value={a.id}>{a.team_home} vs {a.team_away}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"/>
              </div>
            </div>
            <Button onClick={() => couponMutation.mutate()} disabled={couponMutation.isPending || !couponForm.code}
              className="h-11 w-full rounded-xl gradient-primary text-primary-foreground font-bold">
              {couponMutation.isPending ? "Création..." : "Créer le coupon"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pronostics;
