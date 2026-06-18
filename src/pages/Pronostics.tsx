import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart2, Plus, Trophy, Trash2, Edit2, RefreshCw,
  ChevronDown, Calendar, Target, TrendingUp, Tag, Coins,
  AlertTriangle, CheckSquare, Square, ExternalLink, ArrowRight,
  ShoppingCart, Ticket, X, Check, Star, Zap,
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

const COMMISSION_RATE = 0.30;
const PARTNER_LINK = "https://1w.run/?p=YvTH"; // Lien affiliation (inscription)
const WIN_BETTING_URL = "https://1win.com/betting"; // Site paris 1win (booking code)

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  faible: "bg-red-500/15 text-red-600 border-red-400/30",
  moyen:  "bg-amber-500/15 text-amber-600 border-amber-400/30",
  fort:   "bg-green-500/15 text-green-600 border-green-400/30",
};

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  faible: "Risqué", moyen: "Moyen", fort: "Fort",
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

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank");
}

function buildMatchUrl(home: string, away: string, bookmaker: "1win" | "1xbet"): string {
  const q = encodeURIComponent(`${home} ${away}`);
  if (bookmaker === "1win") return `https://1win.com/betting#search=${q}`;
  return `https://1xbet.com/?search=${q}`;
}

function isMatchExpired(a: Analysis): boolean {
  if (!a.match_date) return false;
  return new Date(a.match_date) < new Date();
}

function openBetSequence(matches: Analysis[], bookmaker: "1win" | "1xbet") {
  matches.forEach((m, i) => {
    setTimeout(() => openLink(buildMatchUrl(m.team_home, m.team_away, bookmaker)), i * 800);
  });
}

const Pronostics = () => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const isAdmin   = !!(profile as any)?.is_admin;
  const isPartner = !!(profile as any)?.is_partner;
  const isTelegramMode = new URLSearchParams(window.location.search).get("tg") === "1";

  // Initialise Telegram WebApp en mode plein écran
  useEffect(() => {
    if (isTelegramMode) {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.expand();
        tg.ready();
        tg.setHeaderColor('#0d0d0d');
      }
    }
  }, [isTelegramMode]);

  const [tab, setTab] = useState<"analyses" | "publier" | "coupons">("analyses");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [betBookmaker, setBetBookmaker] = useState<"1win" | "1xbet">("1win");
  const [showCouponRegister, setShowCouponRegister] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponPrice, setCouponPrice] = useState("1000");
  const [couponLabel, setCouponLabel] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [resultTarget, setResultTarget] = useState<Analysis | null>(null);
  const [selectedResult, setSelectedResult] = useState<Result>("en_attente");
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [form, setForm] = useState({
    title: "", team_home: "", team_away: "", league: "", country: "",
    match_date: "", prediction: "", confidence: "moyen" as Confidence, odds: "", notes: "",
  });
  const [couponForm, setCouponForm] = useState({ code: "", label: "", price_fcfa: "500", analysis_id: "" });
  const [adminPackageCode, setAdminPackageCode] = useState("");

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  };

  const { data: analyses = [], isLoading: loadingAnalyses, refetch: refetchAnalyses } = useQuery<Analysis[]>({
    queryKey: ["analyses", isAdmin],
    queryFn: async () => {
      const token = await getToken();
      const { data } = await invoke(isAdmin ? "admin-list" : "list-analyses", {}, token);
      return data?.analyses ?? [];
    },
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
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

  const { data: commData } = useQuery({
    queryKey: ["commissions", user?.id],
    queryFn: async () => {
      const token = await getToken();
      const { data } = await invoke("commission-list", {}, token);
      return data ?? { records: [], total_commission: 0 };
    },
    enabled: isPartner && tab === "coupons",
    staleTime: 30_000,
  });

  const { data: footballMatches = [], refetch: refetchMatches } = useQuery({
    queryKey: ["football-matches"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("football-data", { body: { action: "list" } });
      return data?.matches ?? [];
    },
    enabled: isAdmin && tab === "publier",
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: matchingPackage, refetch: refetchPackage } = useQuery({
    queryKey: ["bookmaker-package", [...selectedIds].sort().join(","), betBookmaker],
    queryFn: async () => {
      if (!selectedIds.size) return null;
      const ids = [...selectedIds];
      const now = new Date().toISOString();
      const { data: packages } = await supabase
        .from("bookmaker_packages")
        .select("*")
        .eq("bookmaker", betBookmaker)
        .gt("expires_at", now)
        .order("created_at", { ascending: false })
        .limit(50);
      const matching = (packages ?? []).find((pkg: any) =>
        ids.every((id: string) => (pkg.analysis_ids as string[]).includes(id))
      );
      return matching ?? null;
    },
    enabled: showBetSlip && selectedIds.size > 0,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { data, error } = await invoke("create-analysis", {
        ...form, odds: form.odds ? Number(form.odds) : null, match_date: form.match_date || null,
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
    onSuccess: () => { toast.success("Analyse supprimée"); queryClient.invalidateQueries({ queryKey: ["analyses"] }); },
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
        title: `${m.team_home} vs ${m.team_away}`, team_home: m.team_home, team_away: m.team_away,
        league: m.league, country: m.country, match_date: date || null, prediction: "À compléter", confidence: "moyen",
      }, token);
      if (!data?.success) throw new Error(data?.error || "Erreur");
    },
    onSuccess: () => { toast.success("Match importé !"); queryClient.invalidateQueries({ queryKey: ["analyses"] }); setTab("analyses"); },
    onError: (e: any) => toast.error(e.message),
  });

  const couponMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { data } = await invoke("coupon-create", {
        ...couponForm, price_fcfa: Number(couponForm.price_fcfa), analysis_id: couponForm.analysis_id || null,
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

  const registerCouponMutation = useMutation({
    mutationFn: async () => {
      if (!couponCode.trim()) throw new Error("Code coupon requis");
      const price = Number(couponPrice);
      if (isNaN(price) || price < 100) throw new Error("Prix minimum 100 FCFA");
      const token = await getToken();
      const label = couponLabel || selectedAnalyses.map(a => `${a.team_home} vs ${a.team_away}`).join(" | ");
      const { data } = await invoke("coupon-create", {
        code: couponCode.trim().toUpperCase(),
        label,
        price_fcfa: price,
        analysis_id: selectedAnalyses.length === 1 ? selectedAnalyses[0].id : null,
      }, token);
      if (!data?.success) throw new Error(data?.error || "Erreur");
    },
    onSuccess: () => {
      toast.success("Coupon mis en vente !");
      setShowCouponRegister(false);
      setSelectedIds(new Set());
      setCouponCode(""); setCouponPrice("1000"); setCouponLabel("");
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      setTab("coupons");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const savePackageMutation = useMutation({
    mutationFn: async () => {
      if (!adminPackageCode.trim()) throw new Error("Code requis");
      const totalOdds = selectedAnalyses
        .filter(a => a.odds)
        .reduce((acc, a) => acc * (Number(a.odds) || 1), 1)
        .toFixed(2);
      const ids = [...selectedIds];
      const { data, error } = await supabase
        .from("bookmaker_packages")
        .insert({
          bookmaker: betBookmaker,
          code: adminPackageCode.trim().toUpperCase(),
          analysis_ids: ids,
          total_odds: Number(totalOdds) || null,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.success("✅ Code sauvegardé ! Tous les utilisateurs le verront automatiquement.");
      setAdminPackageCode("");
      queryClient.invalidateQueries({ queryKey: ["bookmaker-package"] });
      refetchPackage();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const winRate = () => {
    const done = analyses.filter(a => a.result !== "en_attente" && a.result !== "annulé");
    const won  = done.filter(a => a.result === "gagné");
    return done.length > 0 ? Math.round((won.length / done.length) * 100) : 0;
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedAnalyses = analyses.filter(a => selectedIds.has(a.id));
  const priceNum = Number(couponPrice) || 0;
  const commissionAmount = Math.round(priceNum * COMMISSION_RATE);
  const netAmount = priceNum - commissionAmount;

  const handleBetSlip = (bookmaker: "1win" | "1xbet") => {
    setBetBookmaker(bookmaker);
    setShowBetSlip(true);
  };

  const navTabs = [
    { id: "analyses", label: "Pronostics" },
    ...(isPartner ? [{ id: "coupons", label: "Mes Coupons" }] : []),
    ...(isAdmin   ? [{ id: "publier", label: "Publier" }] : []),
  ] as { id: string; label: string }[];

  return (
    <div className={`min-h-screen bg-background ${isTelegramMode ? "pb-20" : "pb-24"}`}>
      <div className={`space-y-4 px-4 ${isTelegramMode ? "pt-4" : "pt-6 mx-auto max-w-lg"}`}>

        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Pronostics</h1>
              {!isTelegramMode && <p className="text-sm text-muted-foreground">Sélectionnez vos matchs · Vendez sur 1win</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => refetchAnalyses()}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted hover:bg-muted/70 transition-colors"
                title="Actualiser les analyses">
                <RefreshCw className={`h-4 w-4 text-muted-foreground ${loadingAnalyses ? "animate-spin" : ""}`} />
              </button>
              {isPartner && (
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15">
                  <Star className="h-5 w-5 text-amber-500" />
                </div>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.05 }}
          className="grid grid-cols-3 gap-3">
          {[
            { label:"Analyses",      value: analyses.length,                                  icon: BarChart2,  color:"text-primary" },
            { label:"Taux réussite", value: `${winRate()}%`,                                  icon: TrendingUp, color:"text-green-600" },
            { label:"En attente",    value: analyses.filter(a=>a.result==="en_attente").length, icon: Target,   color:"text-amber-600" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl bg-card p-3 text-center shadow-card">
              <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </motion.div>

        {!isTelegramMode && <div className="flex gap-1 rounded-2xl bg-muted p-1">
          {navTabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
                tab === t.id ? "bg-card shadow text-foreground" : "text-muted-foreground"
              }`}>{t.label}</button>
          ))}
        </div>}

        {tab === "analyses" && analyses.length > 0 && selectedIds.size === 0 && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
            className="rounded-2xl bg-gradient-to-r from-primary/10 to-amber-500/10 border border-primary/20 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shrink-0">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="font-bold text-foreground text-sm">Créez votre coupon en 4 étapes</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ① Cochez les matchs → ② Ouvrez 1win → ③ Générez votre code → ④ Mettez en vente
                </p>
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">

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
              ) : analyses.map((a, i) => {
                const isSelected = selectedIds.has(a.id);
                return (
                  <motion.div key={a.id} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.04 }}
                    onClick={() => toggleSelect(a.id)}
                    className={`rounded-2xl bg-card shadow-card overflow-hidden cursor-pointer transition-all duration-200 select-none ${
                      isSelected ? "ring-2 ring-primary shadow-lg shadow-primary/20" : "hover:ring-1 hover:ring-primary/30"
                    }`}>
                    <div className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 shrink-0 transition-transform duration-200 ${isSelected ? "scale-110" : ""}`}>
                          {isSelected
                            ? <CheckSquare className="h-5 w-5 text-primary" />
                            : <Square className="h-5 w-5 text-muted-foreground/40" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-foreground text-sm">{a.team_home} vs {a.team_away}</p>
                              <p className="text-[11px] text-muted-foreground">{a.league ?? ""}{a.country ? ` · ${a.country}` : ""}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${CONFIDENCE_COLORS[a.confidence]}`}>
                                {CONFIDENCE_LABELS[a.confidence]}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${RESULT_COLORS[a.result]}`}>
                                {RESULT_LABELS[a.result]}
                              </span>
                            </div>
                          </div>

                          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 mt-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Analyse</p>
                            <p className="text-sm text-foreground font-medium">{a.prediction}</p>
                            {a.odds && <p className="text-xs text-muted-foreground mt-1">Cote : <strong>{a.odds}</strong></p>}
                          </div>

                          {a.notes && <p className="text-xs text-muted-foreground italic leading-relaxed mt-2">{a.notes}</p>}

                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Calendar className="h-3.5 w-3.5" />
                              {a.match_date ? new Date(a.match_date).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : "Date TBD"}
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <button onClick={() => { setResultTarget(a); setSelectedResult(a.result); setShowResultDialog(true); }}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => { if(confirm("Supprimer ?")) deleteMutation.mutate(a.id); }}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="bg-primary/5 border-t border-primary/20 px-4 py-2 flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary" />
                        <p className="text-xs font-semibold text-primary">Match ajouté à votre coupon</p>
                      </div>
                    )}
                  </motion.div>
                );
              })}
              {selectedIds.size > 0 && <div className="h-28" />}
            </motion.div>
          )}

          {tab === "publier" && isAdmin && (
            <motion.div key="publier" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="space-y-4">
              <Button onClick={() => setShowForm(true)}
                className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow">
                <Plus className="h-4 w-4 mr-2" /> Publier une analyse
              </Button>
              <div className="rounded-2xl bg-card p-4 shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-foreground text-sm">Matchs automatiques</p>
                    <p className="text-xs text-muted-foreground">TheSportsDB → OpenLigaDB</p>
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

          {tab === "coupons" && isPartner && (
            <motion.div key="coupons" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} className="space-y-4">
              <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-400/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 shrink-0">
                    <Coins className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-sm">Commissions prélevées (30%)</p>
                    <p className="text-xl font-bold text-amber-600">
                      {((commData as any)?.total_commission ?? 0).toLocaleString("fr-FR")} FCFA
                    </p>
                    <p className="text-[11px] text-muted-foreground">Sur ventes coupons + retraits</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                  <p className="font-bold text-foreground text-sm">Créer un coupon via 1win</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Allez sur <strong>Pronostics</strong>, cochez vos matchs, puis cliquez sur <strong>"Ouvrir sur 1win"</strong> pour générer votre code coupon.
                </p>
                <Button onClick={() => setTab("analyses")} variant="outline" className="h-10 w-full rounded-xl text-sm font-semibold">
                  <ArrowRight className="h-4 w-4 mr-2" /> Sélectionner des matchs
                </Button>
              </div>

              <Button onClick={() => setShowCouponForm(true)}
                className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow">
                <Tag className="h-4 w-4 mr-2" /> Créer un coupon manuellement
              </Button>

              {coupons.length === 0 ? (
                <div className="rounded-2xl bg-card p-6 text-center shadow-card">
                  <Tag className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="font-semibold text-foreground">Aucun coupon créé</p>
                  <p className="text-xs text-muted-foreground mt-1">Cochez des matchs et générez votre premier code 1win.</p>
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
                  {c.analyses && <p className="text-[11px] text-muted-foreground">Match : {c.analyses.team_home} vs {c.analyses.team_away}</p>}
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">{c.sold_count} vente{c.sold_count!==1?"s":""}</p>
                    <p className="text-[11px] text-green-600 font-semibold">Net : {Math.round(c.price_fcfa * 0.70).toLocaleString("fr-FR")} FCFA</p>
                  </div>
                </motion.div>
              ))}

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

      {/* ── Barre flottante de sélection ─────────────────────────────────────── */}
      <AnimatePresence>
        {tab === "analyses" && selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={`fixed left-0 right-0 z-50 px-4 ${isTelegramMode ? "bottom-6" : "bottom-20"}`}>
            <div className="mx-auto max-w-lg rounded-2xl bg-foreground shadow-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shrink-0">
                  <ShoppingCart className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-background text-sm">
                    {selectedIds.size} match{selectedIds.size > 1 ? "s" : ""} sélectionné{selectedIds.size > 1 ? "s" : ""}
                  </p>
                  <p className="text-[11px] text-background/60 truncate">
                    {selectedAnalyses.map(a => `${a.team_home} vs ${a.team_away}`).join(" • ")}
                  </p>
                </div>
                <button onClick={() => setSelectedIds(new Set())}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/10 text-background shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => handleBetSlip("1win")}
                    className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Parier 1Win
                  </Button>
                  <Button onClick={() => handleBetSlip("1xbet")}
                    className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Parier 1xBet
                  </Button>
                </div>
                <Button onClick={() => setShowCouponRegister(true)} variant="outline"
                  className="h-9 w-full rounded-xl text-[11px] font-bold border-background/20 bg-background/10 text-background hover:bg-background/20">
                  <Ticket className="h-3.5 w-3.5 mr-1.5" /> J'ai déjà mon code coupon
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isTelegramMode && <BottomNav />}

      {/* ── Dialog : BetSlip — tunnel de conversion bookmaker ─────────────────── */}
      <Dialog open={showBetSlip} onOpenChange={setShowBetSlip}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-primary" />
              {betBookmaker === "1win" ? "Parier sur 1Win" : "Parier sur 1xBet"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(() => {
              const validMatches   = selectedAnalyses.filter(a => !isMatchExpired(a));
              const expiredMatches = selectedAnalyses.filter(a => isMatchExpired(a));
              const label = betBookmaker === "1win" ? "1Win" : "1xBet";
              const accentBg = betBookmaker === "1win" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700";

              return (
                <>
                  {expiredMatches.length > 0 && (
                    <div className="rounded-xl bg-red-500/10 border border-red-400/30 p-3">
                      <p className="text-xs font-bold text-red-600 mb-1.5">⚠️ Matchs expirés — ignorés</p>
                      {expiredMatches.map(a => (
                        <p key={a.id} className="text-xs text-red-500/60 line-through">
                          {a.team_home} vs {a.team_away}
                        </p>
                      ))}
                    </div>
                  )}

                  {validMatches.length === 0 ? (
                    <div className="rounded-xl bg-muted p-6 text-center">
                      <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                      <p className="text-sm font-semibold text-foreground">Tous les matchs sont expirés</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Sélectionnez des matchs à venir pour parier.
                      </p>
                    </div>
                  ) : matchingPackage ? (
                    <>
                      {/* ── Code bookmaker prêt — affichage direct ──────── */}
                      <div className="rounded-xl bg-green-500/10 border border-green-400/30 p-4 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-green-700 mb-1">
                          ✅ Code coupon prêt à l'emploi
                        </p>
                        <p className="text-3xl font-black font-mono tracking-widest text-foreground my-3">
                          {(matchingPackage as any).code}
                        </p>
                        {(matchingPackage as any).total_odds && (
                          <p className="text-xs text-muted-foreground">
                            Cote totale estimée : ×{(matchingPackage as any).total_odds}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        {[
                          `Ouvrez ${label} et connectez-vous`,
                          `Section "Paris" → "Entrer un code coupon"`,
                          "Collez le code — votre panier se charge",
                          "Confirmez et misez !",
                        ].map((step, i) => (
                          <div key={i} className="flex items-start gap-2.5">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0 mt-0.5">
                              {i + 1}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>

                      <Button
                        onClick={() => { navigator.clipboard?.writeText((matchingPackage as any).code); toast.success("Code copié !"); }}
                        className="h-11 w-full rounded-xl bg-primary text-white font-bold">
                        <Ticket className="h-4 w-4 mr-2" /> Copier le code
                      </Button>
                      <Button
                        onClick={() => openLink(betBookmaker === "1win" ? "https://1win.com/betting" : "https://1xbet.com/en")}
                        className={`h-10 w-full rounded-xl text-white font-bold border-0 ${accentBg}`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ouvrir {label}
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* ── Pas de code sauvegardé — instructions manuelles ─ */}
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {validMatches.length} match{validMatches.length > 1 ? "s" : ""} sélectionné{validMatches.length > 1 ? "s" : ""}
                        </p>
                        {validMatches.map(a => (
                          <div key={a.id} className="flex items-center gap-2.5 rounded-xl bg-muted/50 p-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {a.team_home} vs {a.team_away}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {a.league ?? "Football"}{a.odds ? ` · Cote ×${a.odds}` : ""}
                              </p>
                            </div>
                            <button
                              onClick={() => openLink(buildMatchUrl(a.team_home, a.team_away, betBookmaker))}
                              title={`Ouvrir sur ${label}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground shrink-0 transition-colors">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <Button
                        onClick={() => openBetSequence(validMatches, betBookmaker)}
                        className={`h-12 w-full rounded-xl text-white font-bold shadow-glow ${accentBg}`}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Ouvrir {validMatches.length > 1 ? `les ${validMatches.length} matchs` : "le match"} sur {label}
                      </Button>

                      {betBookmaker === "1win" && (
                        <div className="space-y-2 pt-1 border-t border-border">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pt-1">Ensuite — générez votre code coupon</p>
                          {[
                            "Ajoutez chaque match à votre panier 1Win",
                            "Cliquez \"Générer le code coupon\" dans 1Win",
                            "Copiez le code (ex: A3F2K9)",
                            "Revenez ici → \"J'ai mon code\"",
                          ].map((step, i) => (
                            <div key={i} className="flex items-start gap-2.5">
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0 mt-0.5">
                                {i + 1}
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{step}</p>
                            </div>
                          ))}
                          <Button variant="outline"
                            onClick={() => { setShowBetSlip(false); setShowCouponRegister(true); }}
                            className="h-10 w-full rounded-xl text-xs font-semibold mt-1">
                            <Ticket className="h-3.5 w-3.5 mr-1.5" /> J'ai mon code coupon
                          </Button>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Section admin : enregistrer le code bookmaker UNE FOIS ── */}
                  {isAdmin && !matchingPackage && validMatches.length > 0 && (
                    <div className="pt-2 border-t border-border space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Admin — Enregistrer le code {label} une fois pour tous
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Créez le coupon sur {label}, copiez le code, collez-le ici. Tous les utilisateurs le verront instantanément.
                      </p>
                      <Input
                        value={adminPackageCode}
                        onChange={e => setAdminPackageCode(e.target.value.toUpperCase())}
                        placeholder={betBookmaker === "1win" ? "Ex: A3F2K9" : "Ex: 123456789"}
                        className="h-10 rounded-xl font-mono text-center tracking-widest font-bold text-lg"
                      />
                      <Button
                        onClick={() => savePackageMutation.mutate()}
                        disabled={!adminPackageCode.trim() || savePackageMutation.isPending}
                        className="h-10 w-full rounded-xl text-xs font-bold bg-primary text-white">
                        {savePackageMutation.isPending ? "Sauvegarde..." : "💾 Sauvegarder pour tous les utilisateurs"}
                      </Button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Enregistrer code coupon 1win ────────────────────────────── */}
      <Dialog open={showCouponRegister} onOpenChange={setShowCouponRegister}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" /> Mettre en vente votre coupon
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedAnalyses.length > 0 && (
              <div className="rounded-xl bg-muted/60 p-3 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Matchs dans le coupon</p>
                {selectedAnalyses.map(a => (
                  <div key={a.id} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-primary shrink-0" />
                    <p className="text-xs text-foreground">{a.team_home} vs {a.team_away}</p>
                    <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${CONFIDENCE_COLORS[a.confidence]}`}>
                      {CONFIDENCE_LABELS[a.confidence]}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Code coupon 1win *</label>
              <Input value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Ex: ABC12"
                className="rounded-xl h-11 font-mono text-base font-bold tracking-widest text-center" />
              <p className="text-[10px] text-muted-foreground">Collez le code généré par 1win</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Description (optionnel)</label>
              <Input value={couponLabel} onChange={e => setCouponLabel(e.target.value)}
                placeholder="Ex: Combo 4 matchs sûrs du weekend" className="rounded-xl h-10" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Prix de vente (FCFA) *</label>
              <Input value={couponPrice} onChange={e => setCouponPrice(e.target.value)}
                placeholder="1000" type="number" min="100"
                className="rounded-xl h-11 text-lg font-bold text-center" />
            </div>
            {priceNum >= 100 && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Répartition des revenus</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Prix de vente</span>
                    <span className="font-bold text-foreground">{priceNum.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Commission plateforme (30%)</span>
                    <span className="font-semibold text-amber-600">− {commissionAmount.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                  <div className="border-t border-amber-400/30 pt-1.5 flex justify-between text-sm">
                    <span className="font-bold text-foreground">Vous recevez</span>
                    <span className="font-bold text-green-600">{netAmount.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                </div>
              </div>
            )}
            <Button onClick={() => registerCouponMutation.mutate()}
              disabled={registerCouponMutation.isPending || !couponCode.trim() || priceNum < 100}
              className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow">
              {registerCouponMutation.isPending ? "Mise en vente..." : "Mettre en vente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : Publier analyse (Admin) ─────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary"/>Nouvelle analyse</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[
              { key:"title",      label:"Titre",           placeholder:"Ex: PSG vs OM — Match décisif" },
              { key:"team_home",  label:"Équipe domicile", placeholder:"Ex: PSG" },
              { key:"team_away",  label:"Équipe extérieur",placeholder:"Ex: OM" },
              { key:"league",     label:"Compétition",     placeholder:"Ex: Ligue 1" },
              { key:"country",    label:"Pays",            placeholder:"Ex: France" },
              { key:"prediction", label:"Analyse / Pronostic", placeholder:"Victoire PSG — dominant à domicile" },
              { key:"odds",       label:"Cote (optionnel)", placeholder:"Ex: 1.85" },
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

      {/* ── Dialog : Résultat (Admin) ─────────────────────────────────────────── */}
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

      {/* ── Dialog : Coupon manuel ────────────────────────────────────────────── */}
      <Dialog open={showCouponForm} onOpenChange={setShowCouponForm}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-primary"/>Nouveau coupon</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">30% de commission sera prélevée sur chaque vente de ce coupon.</p>
            </div>
            {[
              { key:"code",       label:"Code coupon",  placeholder:"Ex: PRONO2024" },
              { key:"label",      label:"Description",  placeholder:"Ex: Analyse PSG vs OM" },
              { key:"price_fcfa", label:"Prix (FCFA)",  placeholder:"500" },
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
