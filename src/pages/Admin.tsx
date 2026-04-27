import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Shield, Save, Loader2, Search, RefreshCw, ExternalLink,
  Wallet, Send, Settings, Users, Phone, Copy, CheckCircle,
  AlertCircle, RotateCcw, ChevronDown, ChevronUp, Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface PartnerPackRow {
  id: string;
  user_id: string;
  status: string;
  telegram_number: string | null;
  amount_fcfa: number;
  fedapay_transaction_id: string | null;
  created_at: string;
  delivered_at: string | null;
  subscription_id: string | null;
  profiles?: {
    id?: string | null;
    email?: string | null;
    username?: string | null;
    phone_number?: string | null;
  } | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  paid:               { label: "Payé",   cls: "bg-amber-500/15 text-amber-600 border border-amber-400/30",   icon: AlertCircle },
  partner_id_provided:{ label: "ID saisi",cls: "bg-primary/10 text-primary border border-primary/20",        icon: CheckCircle },
  delivered:          { label: "Livré",  cls: "bg-emerald-500/15 text-emerald-600 border border-emerald-400/30", icon: CheckCircle },
};

type AdminTab = "clients" | "settings";

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<AdminTab>("clients");
  const [linkInput, setLinkInput] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [creditDialog, setCreditDialog] = useState<{ open: boolean; pack: PartnerPackRow | null }>({ open: false, pack: null });
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");

  const [redeliverDialog, setRedeliverDialog] = useState<{ open: boolean; pack: PartnerPackRow | null }>({ open: false, pack: null });

  const pwaUrl = typeof window !== "undefined" ? `${window.location.origin}/install` : "";

  useEffect(() => {
    if (!authLoading && !user) navigate("/login?redirect=/admin");
  }, [authLoading, user, navigate]);

  const { data: adminCheck, isLoading: checkingAdmin } = useQuery({
    queryKey: ["admin-check", user?.id],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("partner-pack", {
        body: { action: "admin-check", user_id: user!.id, email: user!.email },
      });
      return data?.is_admin === true;
    },
    enabled: !!user,
  });

  const { data: currentLink } = useQuery({
    queryKey: ["partner-link"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("partner-pack", {
        body: { action: "settings-get" },
      });
      return (data?.partner_link as string) ?? "";
    },
    enabled: !!adminCheck,
  });

  useEffect(() => {
    if (currentLink !== undefined && !linkInput) setLinkInput(currentLink ?? "");
  }, [currentLink]); // eslint-disable-line

  const { data: list, isLoading: loadingList, refetch } = useQuery({
    queryKey: ["admin-partner-packs", search],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("partner-pack", {
        body: {
          action: "admin-list",
          user_id: user!.id,
          email: user!.email,
          limit: 200,
          search: search.trim() || undefined,
        },
      });
      if (!data?.success) throw new Error(data?.error || "Erreur");
      return { packs: data.packs as PartnerPackRow[], total: data.total as number };
    },
    enabled: !!adminCheck,
  });

  const stats = useMemo(() => {
    const packs = list?.packs ?? [];
    return {
      total: list?.total ?? 0,
      delivered: packs.filter(p => p.status === "delivered").length,
      pending: packs.filter(p => p.status !== "delivered").length,
    };
  }, [list]);

  const saveLinkMutation = useMutation({
    mutationFn: async (newLink: string) => {
      const { data } = await supabase.functions.invoke("partner-pack", {
        body: { action: "admin-set-link", user_id: user!.id, email: user!.email, partner_link: newLink },
      });
      if (!data?.success) throw new Error(data?.error || "Erreur");
      return data;
    },
    onSuccess: () => {
      toast.success("Lien partenaire mis à jour");
      queryClient.invalidateQueries({ queryKey: ["partner-link"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const creditMutation = useMutation({
    mutationFn: async ({ targetUserId, amount, reason }: { targetUserId: string; amount: number; reason: string }) => {
      const { data } = await supabase.functions.invoke("partner-pack", {
        body: {
          action: "admin-credit-wallet",
          user_id: user!.id,
          email: user!.email,
          target_user_id: targetUserId,
          amount_fcfa: amount,
          reason,
        },
      });
      if (!data?.success) throw new Error(data?.error || "Erreur");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Wallet crédité. Nouveau solde : ${data.new_balance?.toLocaleString("fr-FR")} FCFA`);
      setCreditDialog({ open: false, pack: null });
      setCreditAmount("");
      setCreditReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-partner-packs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const redeliverMutation = useMutation({
    mutationFn: async (packId: string) => {
      const { data } = await supabase.functions.invoke("partner-pack", {
        body: { action: "admin-redeliver", user_id: user!.id, email: user!.email, pack_id: packId },
      });
      if (!data?.success) throw new Error(data?.error || "Erreur");
      return data;
    },
    onSuccess: () => {
      toast.success("Numéro re-livré avec succès");
      setRedeliverDialog({ open: false, pack: null });
      queryClient.invalidateQueries({ queryKey: ["admin-partner-packs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copié`));
  };

  if (authLoading || checkingAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!adminCheck) {
    return (
      <div className="min-h-screen bg-background pb-24 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <Shield className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Accès refusé</h2>
          <p className="text-sm text-muted-foreground">Cette page est réservée à l'administrateur.</p>
          <Button onClick={() => navigate("/")} variant="outline">Retour à l'accueil</Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-3xl px-4 pt-6 space-y-5">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Administration</h1>
            <p className="text-xs text-muted-foreground">Tableau de bord WINPACK</p>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 rounded-2xl bg-muted/50 p-1">
          {([
            { id: "clients", label: "Clients", icon: Users },
            { id: "settings", label: "Paramètres", icon: Settings },
          ] as { id: AdminTab; label: string; icon: React.ElementType }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── ONGLET CLIENTS ── */}
        {activeTab === "clients" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total", value: stats.total, cls: "text-foreground" },
                { label: "Livrés", value: stats.delivered, cls: "text-emerald-600" },
                { label: "En attente", value: stats.pending, cls: "text-amber-600" },
              ].map(s => (
                <div key={s.label} className="rounded-2xl bg-card p-4 text-center shadow-card">
                  <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Barre de recherche */}
            <div className="rounded-2xl bg-card p-4 shadow-card space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nom, N° dépôt, N° Telegram…"
                    className="pl-9 h-11 rounded-xl text-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => refetch()}
                  className="h-11 w-11 rounded-xl shrink-0"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Recherche par nom d'utilisateur, email, numéro de dépôt MoMo/Flooz ou numéro Telegram livré.
              </p>
            </div>

            {/* Liste */}
            {loadingList && (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/40" />)}
              </div>
            )}

            {!loadingList && (list?.packs?.length ?? 0) === 0 && (
              <div className="rounded-2xl bg-card p-8 text-center shadow-card">
                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Aucun client trouvé.</p>
              </div>
            )}

            <div className="space-y-2">
              {list?.packs?.map(p => {
                const status = STATUS_LABEL[p.status] ?? { label: p.status, cls: "bg-muted text-muted-foreground border border-border", icon: AlertCircle };
                const StatusIcon = status.icon;
                const who = p.profiles?.username || p.profiles?.email?.split("@")[0] || p.user_id.slice(0, 8);
                const depositPhone = p.profiles?.phone_number || "—";
                const isExpanded = expandedId === p.id;

                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl bg-card shadow-card overflow-hidden"
                  >
                    {/* Row principal */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      className="w-full text-left p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          {/* Nom */}
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-foreground truncate">{who}</p>
                            <span className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>
                              <StatusIcon className="h-2.5 w-2.5" />
                              {status.label}
                            </span>
                          </div>
                          {/* N° dépôt MoMo */}
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span className="font-mono">{depositPhone}</span>
                            <span className="text-muted-foreground/50">· N° dépôt MoMo/Flooz</span>
                          </div>
                          {/* Service + numéro livré */}
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="flex items-center gap-1 rounded-md bg-sky-500/10 text-sky-600 px-1.5 py-0.5 font-semibold">
                              ✈️ Telegram
                            </span>
                            {p.telegram_number ? (
                              <span className="font-mono text-foreground font-semibold">{p.telegram_number}</span>
                            ) : (
                              <span className="text-muted-foreground">Numéro en attente…</span>
                            )}
                          </div>
                          {/* Date */}
                          <p className="text-[11px] text-muted-foreground">
                            {format(new Date(p.created_at), "d MMM yyyy à HH:mm", { locale: fr })}
                            {p.delivered_at && ` · Livré le ${format(new Date(p.delivered_at), "d MMM HH:mm", { locale: fr })}`}
                          </p>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
                      </div>
                    </button>

                    {/* Détails expandables + actions */}
                    {isExpanded && (
                      <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">

                        {/* Infos détaillées */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl bg-muted/40 p-3">
                            <p className="text-muted-foreground mb-0.5">Email</p>
                            <p className="font-medium text-foreground truncate">{p.profiles?.email || "—"}</p>
                          </div>
                          <div className="rounded-xl bg-muted/40 p-3">
                            <p className="text-muted-foreground mb-0.5">Montant payé</p>
                            <p className="font-bold text-foreground">{p.amount_fcfa.toLocaleString("fr-FR")} FCFA</p>
                          </div>
                          <div className="rounded-xl bg-muted/40 p-3 col-span-2">
                            <p className="text-muted-foreground mb-0.5">ID Transaction FedaPay</p>
                            <p className="font-mono text-[11px] text-foreground break-all">{p.fedapay_transaction_id || "—"}</p>
                          </div>
                          {p.telegram_number && (
                            <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/20 p-3 col-span-2">
                              <p className="text-muted-foreground mb-0.5">Numéro Telegram livré</p>
                              <div className="flex items-center gap-2">
                                <p className="font-mono font-bold text-foreground flex-1">{p.telegram_number}</p>
                                <button
                                  onClick={() => copyText(p.telegram_number!, "Numéro")}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Boutons d'action */}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCreditDialog({ open: true, pack: p });
                              setCreditAmount("");
                              setCreditReason("");
                            }}
                            className="flex-1 h-10 rounded-xl text-xs font-semibold gap-1.5"
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            Créditer Wallet
                          </Button>
                          {p.status !== "delivered" && (
                            <Button
                              size="sm"
                              onClick={() => setRedeliverDialog({ open: true, pack: p })}
                              className="flex-1 h-10 rounded-xl gradient-primary text-primary-foreground text-xs font-semibold gap-1.5"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Re-livrer
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── ONGLET PARAMÈTRES ── */}
        {activeTab === "settings" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

            {/* Lien partenaire 1win */}
            <div className="rounded-2xl bg-card p-5 shadow-card space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <ExternalLink className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">Lien partenaire 1win</h2>
                  <p className="text-xs text-muted-foreground">Affiché aux clients après livraison de leur numéro Telegram</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="https://1w.run/?p=..."
                  className="h-11 rounded-xl text-sm flex-1"
                />
                <Button
                  onClick={() => saveLinkMutation.mutate(linkInput.trim())}
                  disabled={saveLinkMutation.isPending || linkInput.trim() === (currentLink ?? "")}
                  className="h-11 rounded-xl gradient-primary text-primary-foreground font-semibold px-4"
                >
                  {saveLinkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
              {currentLink && (
                <div className="flex items-center gap-2">
                  <a
                    href={currentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Tester le lien actuel
                  </a>
                  <button
                    onClick={() => copyText(currentLink, "Lien")}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" /> Copier
                  </button>
                </div>
              )}
            </div>

            {/* Lien PWA */}
            <div className="rounded-2xl bg-card p-5 shadow-card space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                  <Smartphone className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">Lien d'installation PWA</h2>
                  <p className="text-xs text-muted-foreground">Partagez ce lien pour que vos clients installent l'app sur leur téléphone</p>
                </div>
              </div>
              <div className="rounded-xl bg-muted/40 border border-border p-3 flex items-center gap-2">
                <p className="text-sm font-mono text-foreground flex-1 break-all">{pwaUrl}</p>
                <button
                  onClick={() => copyText(pwaUrl, "Lien PWA")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <Button
                variant="outline"
                className="w-full h-10 rounded-xl text-sm gap-2"
                onClick={() => navigate("/install")}
              >
                <Smartphone className="h-4 w-4" />
                Voir la page d'installation
              </Button>
            </div>

            {/* Partage rapide */}
            <div className="rounded-2xl bg-card p-5 shadow-card space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10">
                  <Send className="h-5 w-5 text-sky-500" />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">Partager l'app</h2>
                  <p className="text-xs text-muted-foreground">Envoyez le lien PWA directement via Telegram ou WhatsApp</p>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(pwaUrl)}&text=${encodeURIComponent("🚀 Télécharge l'app Betesim et commence à gagner des commissions !")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 h-10 items-center justify-center gap-2 rounded-xl bg-sky-500 text-white text-sm font-semibold"
                >
                  <Send className="h-4 w-4" />
                  Telegram
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`🚀 Télécharge l'app Betesim ici : ${pwaUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold"
                >
                  Whatsapp
                </a>
              </div>
            </div>

          </motion.div>
        )}

      </div>
      <BottomNav />

      {/* Dialog : Créditer Wallet */}
      <Dialog open={creditDialog.open} onOpenChange={(o) => { if (!o) setCreditDialog({ open: false, pack: null }); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Créditer le wallet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Client</p>
              <p className="font-bold text-foreground">
                {creditDialog.pack?.profiles?.username || creditDialog.pack?.profiles?.email?.split("@")[0] || creditDialog.pack?.user_id.slice(0, 8)}
              </p>
              {creditDialog.pack?.profiles?.phone_number && (
                <p className="text-xs font-mono text-muted-foreground">{creditDialog.pack.profiles.phone_number}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Montant à créditer (FCFA)</label>
              <Input
                type="number"
                min="1"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="ex : 2500"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Raison (optionnel)</label>
              <Input
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                placeholder="ex : Remboursement livraison…"
                className="h-11 rounded-xl"
              />
            </div>
            <Button
              onClick={() => {
                if (!creditDialog.pack?.profiles?.id && !creditDialog.pack?.user_id) return;
                const targetId = creditDialog.pack.profiles?.id || creditDialog.pack.user_id;
                const amount = parseInt(creditAmount, 10);
                if (isNaN(amount) || amount <= 0) { toast.error("Montant invalide"); return; }
                creditMutation.mutate({ targetUserId: targetId, amount, reason: creditReason });
              }}
              disabled={creditMutation.isPending || !creditAmount}
              className="w-full h-11 rounded-xl gradient-primary text-primary-foreground font-bold"
            >
              {creditMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmer le crédit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog : Re-livraison */}
      <Dialog open={redeliverDialog.open} onOpenChange={(o) => { if (!o) setRedeliverDialog({ open: false, pack: null }); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-primary" />
              Re-livrer un numéro
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3">
              <p className="text-xs text-amber-700 font-medium">
                Un nouveau numéro Telegram va être acheté sur SMSPool et livré au client. Cette action est irréversible et engendre un coût.
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Client</p>
              <p className="font-bold text-foreground">
                {redeliverDialog.pack?.profiles?.username || redeliverDialog.pack?.profiles?.email?.split("@")[0] || redeliverDialog.pack?.user_id.slice(0, 8)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setRedeliverDialog({ open: false, pack: null })}
                className="flex-1 h-11 rounded-xl"
              >
                Annuler
              </Button>
              <Button
                onClick={() => redeliverDialog.pack && redeliverMutation.mutate(redeliverDialog.pack.id)}
                disabled={redeliverMutation.isPending}
                className="flex-1 h-11 rounded-xl gradient-primary text-primary-foreground font-bold"
              >
                {redeliverMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Admin;
