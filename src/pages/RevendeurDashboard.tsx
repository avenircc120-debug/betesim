import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PlusCircle, Tag, Wallet, TrendingUp, ArrowDownCircle,
  CheckCircle, XCircle, Clock, Loader2, RefreshCw, Store,
  Copy, Check, Share2, Send, Link2, Trophy, ChevronDown,
  ChevronUp, Zap, Target, BarChart2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

const APP_BASE     = "https://betesim.vercel.app";
const TELEGRAM_BOT = "https://t.me/pack_officiel_expert_bot";

interface Coupon {
  id: string; code: string; label: string | null; price_fcfa: number;
  sold_count: number; status: string; created_at: string;
  analyses?: { title: string; team_home: string; team_away: string } | null;
}
interface CommissionRecord {
  id: string; type: string; gross_amount: number;
  net_amount: number; description: string | null; created_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active:  { label: "En vente",  color: "text-green-400",  icon: <CheckCircle className="w-3.5 h-3.5" /> },
  sold:    { label: "Vendu",     color: "text-blue-400",   icon: <CheckCircle className="w-3.5 h-3.5" /> },
  paused:  { label: "Pausé",     color: "text-yellow-400", icon: <Clock       className="w-3.5 h-3.5" /> },
  expired: { label: "Expiré",    color: "text-red-400",    icon: <XCircle     className="w-3.5 h-3.5" /> },
};

type Tab = "pronostics" | "coupons" | "outils" | "commissions";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      toast.success(`${label} copié !`);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-medium transition-colors">
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copié !" : "Copier"}
    </button>
  );
}

export default function RevendeurDashboard() {
  const { user, requireAuth } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("pronostics");
  const [showWithdraw, setShowWithdraw] = useState(false);

  // Formulaire "Publier un Coupon" — simplifié : 3 champs
  const [pForm, setPForm] = useState({
    coupon_code: "", total_odds: "", match_start_time: "", label: "",
  });

  function calcPriceFromOdds(odds: string): number {
    const n = parseFloat(odds);
    if (isNaN(n) || n < 2) return 0;
    if (n < 5.50) return 250;
    if (n < 16.00) return 500;
    return 1000;
  }

  // Formulaire retrait
  const [wForm, setWForm] = useState({ amount: "", phone: "", provider: "mtn" });

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: coupons = [], isLoading: loadingCoupons, refetch } = useQuery<Coupon[]>({
    queryKey: ["my-pool-coupons", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("*, analyses(title,team_home,team_away)")
        .eq("creator_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
  });

  const { data: commissions = [] } = useQuery<CommissionRecord[]>({
    queryKey: ["my-commissions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_records")
        .select("id,type,gross_amount,net_amount,description,created_at")
        .eq("partner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as CommissionRecord[];
    },
  });

  const { data: wallet } = useQuery({
    queryKey: ["seller-wallet", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("seller_wallet_balances").select("*").eq("partner_id", user!.id).maybeSingle();
      return data;
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  // Publier un coupon dans le coffre (Pool Commun) — mode simplifié
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!pForm.coupon_code.trim()) throw new Error("Code coupon requis");
      const odds = parseFloat(pForm.total_odds);
      if (isNaN(odds) || odds < 2) throw new Error("Cote totale invalide (minimum 2.00)");
      if (!pForm.match_start_time) throw new Error("Date/Heure de début requise");
      const matchStart = new Date(pForm.match_start_time);
      if (matchStart <= new Date()) throw new Error("L'heure de début doit être dans le futur");

      const body = {
        coupon_code:      pForm.coupon_code.trim().toUpperCase(),
        total_odds:       odds,
        match_start_time: matchStart.toISOString(),
        label:            pForm.label.trim() || undefined,
      };

      const { data, error } = await supabase.functions.invoke("inject-to-pool", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (d) => {
      const price = d.price_fcfa?.toLocaleString?.() ?? "?";
      toast.success(`Coupon publié dans le coffre ! Code : ${d.code} — ${price} FCFA 🎉`);
      setPForm({ coupon_code: "", total_odds: "", match_start_time: "", label: "" });
      qc.invalidateQueries({ queryKey: ["my-pool-coupons"] });
      setTab("coupons");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Demande de retrait
  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const amount = parseInt(wForm.amount);
      if (isNaN(amount) || amount < 500) throw new Error("Montant minimum : 500 FCFA");
      if (!wForm.phone.trim()) throw new Error("Numéro de téléphone requis");
      const { error } = await supabase.from("seller_withdrawal_requests").insert({
        partner_id: user!.id, amount_fcfa: amount,
        phone_number: wForm.phone.trim(), provider: wForm.provider,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Demande de retrait envoyée ✅");
      setShowWithdraw(false);
      setWForm({ amount:"", phone:"", provider:"mtn" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Guard partenaire ─────────────────────────────────────────────────────────
  if (!profile?.is_partner) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 gap-4">
        <Store className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground text-sm text-center">Accès réservé aux revendeurs partenaires.</p>
        <BottomNav />
      </div>
    );
  }

  const p = profile as Record<string, unknown>;
  const referralCode    = (p.referral_code as string) ?? "";
  const referralLink    = referralCode ? `${APP_BASE}?ref=${referralCode}` : `${APP_BASE}`;
  const clientSaleLink  = TELEGRAM_BOT;
  const marketplaceLink = `${APP_BASE}/marketplace`;

  const totalEarned   = (wallet as Record<string,unknown>)?.total_earned_fcfa  as number ?? 0;
  const totalSales    = (wallet as Record<string,unknown>)?.total_sales         as number ?? 0;
  const activeCoupons = coupons.filter(c => c.status === "active").length;
  const soldCoupons   = coupons.filter(c => c.status === "sold").length;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "pronostics",  label: "Publier",     icon: <Zap        className="w-4 h-4" /> },
    { id: "coupons",     label: "Mes coupons", icon: <Tag        className="w-4 h-4" /> },
    { id: "outils",      label: "Partage",     icon: <Share2     className="w-4 h-4" /> },
    { id: "commissions", label: "Commissions", icon: <BarChart2  className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-4 pt-6 space-y-5 max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Dashboard Revendeur</h1>
            <p className="text-xs text-muted-foreground">Pool Commun Betesim</p>
          </div>
          <button onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["seller-wallet"] }); }}
            className="p-2 rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: <Wallet    className="w-4 h-4" />, label: "Gains nets",      value: `${totalEarned.toLocaleString()} FCFA`, color: "text-green-400" },
            { icon: <TrendingUp className="w-4 h-4"/>, label: "Ventes totales",  value: String(totalSales), color: "text-blue-400" },
            { icon: <Tag       className="w-4 h-4" />, label: "Actifs",          value: String(activeCoupons), color: "text-yellow-400" },
            { icon: <Trophy    className="w-4 h-4" />, label: "Vendus",          value: String(soldCoupons), color: "text-purple-400" },
          ].map(s => (
            <motion.div key={s.label} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
              className="bg-card border border-border rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={s.color}>{s.icon}</span>{s.label}
              </div>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Commission rule */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 text-xs text-blue-300">
          <p className="font-semibold mb-0.5">Répartition automatique par vente</p>
          <p>🟢 Vous : <strong>70%</strong> &nbsp;·&nbsp; 🟡 Parrain client : <strong>10%</strong> &nbsp;·&nbsp; 🔴 Plateforme : <strong>20%</strong></p>
        </div>

        {/* Tabs */}
        <div className="flex bg-muted rounded-xl p-1 gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs font-medium transition-all ${
                tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              {t.icon}
              <span className="text-[10px]">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB: PUBLIER UN PRONOSTIC ───────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {tab === "pronostics" && (
            <motion.div key="pronostics" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              className="space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Publier un pronostic dans le Pool</h2>
              </div>

              {/* Barème info */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Prix calculé automatiquement depuis la cote</p>
                <p>📊 Cote 2.00 – 5.49 → <strong className="text-foreground">250 FCFA</strong></p>
                <p>📊 Cote 5.50 – 15.99 → <strong className="text-foreground">500 FCFA</strong></p>
                <p>📊 Cote 16.00+ → <strong className="text-foreground">1 000 FCFA</strong></p>
              </div>

              {/* Code coupon */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Code Coupon</p>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Code booking 1xBet / 1Win *</label>
                  <Input placeholder="Collez votre code ici" value={pForm.coupon_code}
                    onChange={e => setPForm(f => ({ ...f, coupon_code: e.target.value }))}
                    className="font-mono uppercase text-sm tracking-wider" />
                  <p className="text-xs text-muted-foreground mt-1">Le code restera masqué jusqu'au paiement du client.</p>
                </div>
              </div>

              {/* Cote + heure */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cote & Horaire</p>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Cote totale du coupon *</label>
                  <Input type="number" step="0.01" min="2" placeholder="ex: 4.50" value={pForm.total_odds}
                    onChange={e => setPForm(f => ({ ...f, total_odds: e.target.value }))} />
                  {pForm.total_odds && calcPriceFromOdds(pForm.total_odds) > 0 && (
                    <p className="text-xs mt-1">
                      Prix calculé : <strong className="text-primary">{calcPriceFromOdds(pForm.total_odds).toLocaleString()} FCFA</strong>
                      &nbsp;·&nbsp; Votre part (70%) :{" "}
                      <strong className="text-green-400">{Math.floor(calcPriceFromOdds(pForm.total_odds) * 0.70).toLocaleString()} FCFA</strong>
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Date / Heure de début des matchs *</label>
                  <Input type="datetime-local" value={pForm.match_start_time}
                    onChange={e => setPForm(f => ({ ...f, match_start_time: e.target.value }))} />
                  <p className="text-xs text-muted-foreground mt-1">Le coupon sera automatiquement supprimé à cette heure.</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Description (optionnel)</label>
                  <Input placeholder="ex: Combo 3 matchs du soir" value={pForm.label}
                    onChange={e => setPForm(f => ({ ...f, label: e.target.value }))} />
                </div>
              </div>

              <Button className="w-full gap-2" onClick={() => requireAuth(() => publishMutation.mutate())}
                disabled={publishMutation.isPending}>
                {publishMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Publication en cours…</>
                  : <><Zap className="w-4 h-4" />Déposer dans le coffre</>}
              </Button>
            </motion.div>
          )}

          {/* ── TAB: MES COUPONS ──────────────────────────────────────────── */}
          {tab === "coupons" && (
            <motion.div key="coupons" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Mes coupons injectés</h2>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                  onClick={() => requireAuth(() => setTab("pronostics"))}>
                  <PlusCircle className="w-3.5 h-3.5" /> Nouveau
                </Button>
              </div>

              {loadingCoupons ? (
                <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : coupons.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Tag className="w-8 h-8 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground text-sm">Aucun coupon publié. Utilisez l'onglet "Publier".</p>
                </div>
              ) : (
                coupons.map(c => {
                  const s = STATUS_MAP[c.status] ?? STATUS_MAP.active;
                  return (
                    <div key={c.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono font-bold text-sm text-foreground">{c.code}</p>
                          {c.label && <p className="text-xs text-muted-foreground">{c.label}</p>}
                          {c.analyses && <p className="text-xs text-muted-foreground mt-0.5">{c.analyses.team_home} vs {c.analyses.team_away}</p>}
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-medium ${s.color}`}>
                          {s.icon}{s.label}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Prix : <strong className="text-foreground">{c.price_fcfa.toLocaleString()} FCFA</strong></span>
                        <span>{new Date(c.created_at).toLocaleDateString("fr-FR")}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

          {/* ── TAB: OUTILS DE PARTAGE ────────────────────────────────────── */}
          {tab === "outils" && (
            <motion.div key="outils" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Share2 className="w-4 h-4 text-primary" /> Mes outils de partage
              </h2>

              {/* Lien de parrainage */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Link2 className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Lien de parrainage</p>
                    <p className="text-xs text-muted-foreground">Recrutez d'autres revendeurs</p>
                  </div>
                </div>
                <div className="bg-muted rounded-lg px-3 py-2 font-mono text-xs text-foreground break-all">
                  {referralLink}
                </div>
                <div className="flex gap-2">
                  <CopyButton value={referralLink} label="Lien de parrainage" />
                  <a href={`https://wa.me/?text=${encodeURIComponent("Rejoins l'équipe Betesim et gagne des commissions : " + referralLink)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs font-medium transition-colors">
                    <Send className="w-3.5 h-3.5" /> WhatsApp
                  </a>
                </div>
                {referralCode && (
                  <p className="text-xs text-muted-foreground">Code : <span className="font-mono text-primary font-bold">{referralCode}</span></p>
                )}
              </div>

              {/* Lien de vente client */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Send className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Lien Telegram Bot</p>
                    <p className="text-xs text-muted-foreground">Vos clients achètent ici</p>
                  </div>
                </div>
                <div className="bg-muted rounded-lg px-3 py-2 font-mono text-xs text-foreground break-all">
                  {clientSaleLink}
                </div>
                <div className="flex gap-2">
                  <CopyButton value={clientSaleLink} label="Lien bot" />
                  <a href={`https://wa.me/?text=${encodeURIComponent("🎯 Achetez mes pronostics du jour sur le bot officiel : " + clientSaleLink)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs font-medium transition-colors">
                    <Send className="w-3.5 h-3.5" /> WhatsApp
                  </a>
                </div>
              </div>

              {/* Marketplace web */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <Store className="w-4 h-4 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Lien Marketplace Web</p>
                    <p className="text-xs text-muted-foreground">Alternative web au bot</p>
                  </div>
                </div>
                <div className="bg-muted rounded-lg px-3 py-2 font-mono text-xs text-foreground break-all">
                  {marketplaceLink}
                </div>
                <CopyButton value={marketplaceLink} label="Lien marketplace" />
              </div>

              {/* Guide rapide */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-2 text-xs text-green-300">
                <p className="font-semibold text-green-400">📋 Workflow en 3 étapes</p>
                <p>1️⃣ Créez votre coupon dans l'onglet <strong>Publier</strong> avec le code 1xBet/1Win</p>
                <p>2️⃣ Partagez le <strong>lien Telegram Bot</strong> à vos clients</p>
                <p>3️⃣ Le bot distribue le code et vos <strong>commissions (70%)</strong> arrivent automatiquement</p>
              </div>

              {/* Retrait */}
              <Button variant="outline" className="w-full gap-2"
                onClick={() => requireAuth(() => setShowWithdraw(true))}>
                <ArrowDownCircle className="w-4 h-4" /> Retirer mes gains
              </Button>
            </motion.div>
          )}

          {/* ── TAB: COMMISSIONS ─────────────────────────────────────────── */}
          {tab === "commissions" && (
            <motion.div key="commissions" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Historique des commissions</h2>
              {commissions.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <BarChart2 className="w-8 h-8 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground text-sm">Aucune commission pour l'instant.</p>
                </div>
              ) : (
                commissions.map(c => (
                  <div key={c.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground font-medium truncate">{c.description ?? c.type}</p>
                      <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("fr-FR", { day:"2-digit", month:"short", year:"2-digit" })}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-green-400">+{c.net_amount.toLocaleString()} FCFA</p>
                      <p className="text-xs text-muted-foreground">brut : {c.gross_amount.toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal: Retrait */}
      <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Demande de retrait</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-xs text-muted-foreground">Solde disponible : <strong className="text-foreground">{totalEarned.toLocaleString()} FCFA</strong></p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Montant (FCFA, min 500)</label>
              <Input type="number" min={500} placeholder="500" value={wForm.amount}
                onChange={e => setWForm(f=>({...f, amount: e.target.value}))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Numéro Mobile Money</label>
              <Input placeholder="+229 XX XX XX XX" value={wForm.phone}
                onChange={e => setWForm(f=>({...f, phone: e.target.value}))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Opérateur</label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={wForm.provider} onChange={e => setWForm(f=>({...f, provider: e.target.value}))}>
                <option value="mtn">MTN Mobile Money</option>
                <option value="moov">Moov Money</option>
                <option value="orange">Orange Money</option>
              </select>
            </div>
            <Button className="w-full" onClick={() => withdrawMutation.mutate()} disabled={withdrawMutation.isPending}>
              {withdrawMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Envoi…</> : "Envoyer la demande"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
