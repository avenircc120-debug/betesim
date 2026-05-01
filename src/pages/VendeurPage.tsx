import { useState } from "react";
import {
  Wallet, TrendingUp, Tag, Banknote, RefreshCw,
  Phone, CheckCircle, XCircle, Loader2, ChevronRight,
  Clock, AlertCircle, ArrowRight, ShoppingCart, BarChart2,
  Edit2, Check, X, Coins
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BottomNav from "@/components/BottomNav";
import { useProfile } from "@/hooks/useProfile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const COMMISSION_RATE = 0.30;
const MIN_WITHDRAW = 500;
const PROVIDERS = [
  { id: "mtn",   label: "MTN Mobile Money",  color: "bg-yellow-500" },
  { id: "moov",  label: "Moov Money",         color: "bg-blue-500" },
  { id: "orange", label: "Orange Money",      color: "bg-orange-500" },
];

type WithdrawStep = "form" | "confirm" | "processing" | "success" | "error";

interface Coupon {
  id: string;
  code: string;
  label: string | null;
  price_fcfa: number;
  sold_count: number;
  status: string;
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

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, [string, string]> = {
    pending:    ["bg-amber-100 text-amber-700",  "En attente"],
    processing: ["bg-blue-100 text-blue-700",    "En cours"],
    completed:  ["bg-green-100 text-green-700",  "Validé"],
    failed:     ["bg-red-100 text-red-700",      "Échoué"],
    active:     ["bg-green-100 text-green-700",  "Actif"],
    paused:     ["bg-gray-100 text-gray-600",    "Pausé"],
    expired:    ["bg-red-100 text-red-500",      "Expiré"],
  };
  const [cls, label] = map[status] ?? ["bg-gray-100 text-gray-600", status];
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
};

const VendeurPage = () => {
  const { user, requireAuth } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"wallet" | "coupons" | "retrait">("wallet");

  // Retrait state
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState("mtn");
  const [step, setStep] = useState<WithdrawStep>("form");
  const [errorMsg, setErrorMsg] = useState("");
  const [editingCoupon, setEditingCoupon] = useState<{ id: string; price: string } | null>(null);

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  };

  const invoke = async (action: string, extra?: Record<string, unknown>) => {
    const t = await getToken();
    return supabase.functions.invoke("pronostics", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${t}` },
    });
  };

  // Balance : sum des net_amount de commission_records
  const { data: balanceData, isLoading: loadingBalance } = useQuery({
    queryKey: ["seller-balance", user?.id],
    queryFn: async () => {
      if (!user) return { earned: 0, withdrawn: 0, available: 0, totalSales: 0 };
      const token = await getToken();
      const { data: records } = await supabase
        .from("commission_records")
        .select("type, net_amount, gross_amount, commission_amount")
        .eq("partner_id", user.id);
      const arr = (records ?? []) as CommissionRecord[];
      const earned = arr.filter(r => r.type === "coupon_sale").reduce((s, r) => s + (r.net_amount ?? 0), 0);
      const totalSales = arr.filter(r => r.type === "coupon_sale").length;

      const { data: wdReqs } = await supabase
        .from("seller_withdrawal_requests")
        .select("amount_fcfa, status")
        .eq("partner_id", user.id)
        .in("status", ["pending", "processing", "completed"]);
      const withdrawn = (wdReqs ?? []).reduce((s: number, r: any) => s + (r.amount_fcfa ?? 0), 0);
      return { earned, withdrawn, available: Math.max(0, earned - withdrawn), totalSales };
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: coupons = [], isLoading: loadingCoupons } = useQuery<Coupon[]>({
    queryKey: ["seller-coupons", user?.id],
    queryFn: async () => {
      const token = await getToken();
      const { data } = await supabase.functions.invoke("pronostics", {
        body: { action: "coupon-list" },
        headers: { Authorization: `Bearer ${token}` },
      });
      return (data?.coupons ?? []) as Coupon[];
    },
    enabled: !!user && activeTab === "coupons",
    staleTime: 30_000,
  });

  const { data: recentSales = [] } = useQuery<CommissionRecord[]>({
    queryKey: ["seller-sales", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("commission_records")
        .select("*")
        .eq("partner_id", user.id)
        .eq("type", "coupon_sale")
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as CommissionRecord[];
    },
    enabled: !!user && activeTab === "wallet",
    staleTime: 30_000,
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ["seller-withdrawals", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("seller_withdrawal_requests")
        .select("*")
        .eq("partner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!user && activeTab === "retrait",
    staleTime: 30_000,
  });

  const updatePriceMutation = useMutation({
    mutationFn: async ({ id, price_fcfa }: { id: string; price_fcfa: number }) => {
      const { error } = await supabase
        .from("coupons")
        .update({ price_fcfa })
        .eq("id", id)
        .eq("partner_id", user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prix mis à jour !");
      setEditingCoupon(null);
      queryClient.invalidateQueries({ queryKey: ["seller-coupons"] });
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const amtNum = Number(amount);
      if (amtNum < MIN_WITHDRAW) throw new Error(`Minimum ${MIN_WITHDRAW} FCFA`);
      if (!phone.trim()) throw new Error("Numéro requis");
      if (amtNum > (balanceData?.available ?? 0)) throw new Error("Solde insuffisant");
      const { error } = await supabase.from("seller_withdrawal_requests").insert({
        partner_id: user?.id,
        amount_fcfa: amtNum,
        phone_number: phone.trim(),
        provider,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["seller-balance"] });
      queryClient.invalidateQueries({ queryKey: ["seller-withdrawals"] });
    },
    onError: (e: any) => { setErrorMsg(e.message); setStep("error"); },
  });

  if (!user || !(profile as any)?.is_partner) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="font-bold text-lg text-foreground mb-2">Espace Vendeur</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Cet espace est réservé aux partenaires Pack Officiel.
        </p>
        <Button onClick={() => requireAuth(() => {})}>Se connecter</Button>
        <BottomNav />
      </div>
    );
  }

  const available = balanceData?.available ?? 0;
  const earned    = balanceData?.earned ?? 0;
  const totalSales = balanceData?.totalSales ?? 0;
  const TABS = [
    { id: "wallet",  label: "Wallet",   icon: Wallet },
    { id: "coupons", label: "Coupons",  icon: Tag },
    { id: "retrait", label: "Retrait",  icon: Banknote },
  ] as const;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-primary to-primary/70 text-white px-4 pt-12 pb-8">
        <p className="text-sm font-medium opacity-80 mb-1">Sous-Wallet Vendeur</p>
        {loadingBalance ? (
          <div className="h-10 w-40 bg-white/20 rounded-lg animate-pulse" />
        ) : (
          <div>
            <p className="text-3xl font-extrabold tracking-tight">{available.toLocaleString("fr-FR")} FCFA</p>
            <p className="text-xs opacity-70 mt-1">Disponible au retrait</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/15 rounded-2xl p-3">
            <p className="text-xs opacity-70">Total gagné</p>
            <p className="text-base font-bold">{earned.toLocaleString("fr-FR")} F</p>
          </div>
          <div className="bg-white/15 rounded-2xl p-3">
            <p className="text-xs opacity-70">Ventes</p>
            <p className="text-base font-bold">{totalSales} coupon{totalSales !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background border-b border-border flex">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex flex-col items-center py-2.5 text-[11px] font-semibold transition-colors gap-0.5 ${
              activeTab === id ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">
        <AnimatePresence mode="wait">

          {/* ── WALLET TAB ──────────────────────────────────────────────── */}
          {activeTab === "wallet" && (
            <motion.div key="wallet" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Commission info */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-amber-100 rounded-xl p-2">
                    <Coins className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-800">Commission Plateforme : 30%</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Sur chaque vente de coupon, 30% va à la plateforme. Vous recevez 70%.
                    </p>
                    <div className="mt-2 bg-white rounded-xl p-2 border border-amber-100">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Prix coupon (ex. 1 000 F)</span>
                        <span className="font-semibold">1 000 F</span>
                      </div>
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-red-600">− Commission 30%</span>
                        <span className="font-semibold text-red-600">− 300 F</span>
                      </div>
                      <div className="flex justify-between text-xs mt-1 border-t pt-1">
                        <span className="text-green-700 font-bold">Vous recevez</span>
                        <span className="font-bold text-green-700">700 F</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent sales */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Dernières ventes</p>
                {recentSales.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aucune vente encore</p>
                    <p className="text-xs mt-1">Créez un coupon et partagez-le pour commencer à vendre.</p>
                  </div>
                ) : recentSales.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                    <div className="bg-green-100 rounded-full p-2">
                      <ShoppingCart className="h-3.5 w-3.5 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {r.description ?? "Vente coupon"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">+{r.net_amount.toLocaleString("fr-FR")} F</p>
                      <p className="text-[10px] text-muted-foreground">− {r.commission_amount.toLocaleString("fr-FR")} F com.</p>
                    </div>
                  </div>
                ))}
              </div>

              {available > 0 && (
                <Button className="w-full rounded-2xl h-12" onClick={() => setActiveTab("retrait")}>
                  <Banknote className="h-4 w-4 mr-2" /> Retirer {available.toLocaleString("fr-FR")} FCFA
                </Button>
              )}
            </motion.div>
          )}

          {/* ── COUPONS TAB ─────────────────────────────────────────────── */}
          {activeTab === "coupons" && (
            <motion.div key="coupons" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Mes coupons</p>
                <Button variant="outline" size="sm" className="h-7 text-xs rounded-xl" onClick={() => queryClient.invalidateQueries({ queryKey: ["seller-coupons"] })}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Rafraîchir
                </Button>
              </div>

              {loadingCoupons ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />
                ))
              ) : coupons.length === 0 ? (
                <div className="text-center py-10">
                  <Tag className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-foreground">Aucun coupon</p>
                  <p className="text-xs text-muted-foreground mt-1">Créez votre premier coupon depuis la page Pronostics.</p>
                  <Button className="mt-4 rounded-xl" onClick={() => window.location.href = "/pronostics"}>
                    <ArrowRight className="h-4 w-4 mr-1" /> Aller aux Pronostics
                  </Button>
                </div>
              ) : coupons.map((c) => {
                const earning = Math.round(c.price_fcfa * (1 - COMMISSION_RATE));
                const totalEarned = c.sold_count * earning;
                const isEditing = editingCoupon?.id === c.id;
                return (
                  <div key={c.id} className="bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-foreground font-mono">{c.code}</p>
                          <StatusBadge status={c.status} />
                        </div>
                        {c.label && <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{c.sold_count} vente{c.sold_count !== 1 ? "s" : ""}</p>
                        <p className="text-xs font-bold text-green-600">+{totalEarned.toLocaleString("fr-FR")} F</p>
                      </div>
                    </div>

                    {/* Prix + édition */}
                    <div className="flex items-center gap-2 mt-2">
                      {isEditing ? (
                        <>
                          <Input
                            type="number"
                            value={editingCoupon!.price}
                            onChange={e => setEditingCoupon({ ...editingCoupon!, price: e.target.value })}
                            className="h-8 text-sm rounded-xl flex-1"
                            placeholder="Prix FCFA"
                          />
                          <Button
                            size="sm" className="h-8 px-3 rounded-xl"
                            onClick={() => updatePriceMutation.mutate({ id: c.id, price_fcfa: Number(editingCoupon!.price) })}
                            disabled={updatePriceMutation.isPending}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 px-3 rounded-xl" onClick={() => setEditingCoupon(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 bg-muted rounded-xl px-3 py-1.5">
                            <p className="text-xs text-muted-foreground">Prix de vente</p>
                            <p className="text-sm font-bold text-foreground">{c.price_fcfa.toLocaleString("fr-FR")} FCFA</p>
                            <p className="text-[10px] text-green-600">→ Vous recevez : {earning.toLocaleString("fr-FR")} F</p>
                          </div>
                          <Button
                            size="sm" variant="outline" className="h-10 px-3 rounded-xl"
                            onClick={() => setEditingCoupon({ id: c.id, price: String(c.price_fcfa) })}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {/* ── RETRAIT TAB ─────────────────────────────────────────────── */}
          {activeTab === "retrait" && (
            <motion.div key="retrait" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <AnimatePresence mode="wait">
                {step === "success" ? (
                  <motion.div key="success" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-10">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="font-bold text-lg">Demande envoyée !</h3>
                    <p className="text-sm text-muted-foreground mt-2">Votre retrait de {Number(amount).toLocaleString("fr-FR")} FCFA est en cours de traitement.</p>
                    <Button className="mt-6 rounded-2xl" onClick={() => { setStep("form"); setAmount(""); setPhone(""); }}>
                      Nouvelle demande
                    </Button>
                  </motion.div>
                ) : step === "error" ? (
                  <motion.div key="error" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-10">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <XCircle className="h-8 w-8 text-red-500" />
                    </div>
                    <h3 className="font-bold text-lg">Erreur</h3>
                    <p className="text-sm text-muted-foreground mt-2">{errorMsg}</p>
                    <Button variant="outline" className="mt-6 rounded-2xl" onClick={() => setStep("form")}>Réessayer</Button>
                  </motion.div>
                ) : (
                  <motion.div key="form" className="space-y-4">
                    {/* Solde disponible */}
                    <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-4">
                      <p className="text-xs text-muted-foreground mb-1">Solde disponible</p>
                      <p className="text-2xl font-extrabold text-primary">{available.toLocaleString("fr-FR")} FCFA</p>
                      {available < MIN_WITHDRAW && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Minimum {MIN_WITHDRAW} FCFA pour retirer
                        </p>
                      )}
                    </div>

                    {/* Opérateur */}
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Opérateur</p>
                      <div className="grid grid-cols-3 gap-2">
                        {PROVIDERS.map(p => (
                          <button
                            key={p.id}
                            onClick={() => setProvider(p.id)}
                            className={`rounded-xl p-3 text-xs font-bold border-2 transition-all ${
                              provider === p.id ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Montant */}
                    <div>
                      <label className="text-xs font-bold text-muted-foreground">Montant (FCFA)</label>
                      <Input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        className="mt-1 h-12 rounded-xl text-sm"
                        placeholder={`Min. ${MIN_WITHDRAW} FCFA`}
                      />
                      {Number(amount) > 0 && (
                        <p className="text-xs text-green-600 mt-1">
                          Vous allez recevoir ≈ {Number(amount).toLocaleString("fr-FR")} FCFA sur votre {provider.toUpperCase()}
                        </p>
                      )}
                    </div>

                    {/* Numéro */}
                    <div>
                      <label className="text-xs font-bold text-muted-foreground">Numéro {provider.toUpperCase()}</label>
                      <Input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className="mt-1 h-12 rounded-xl text-sm"
                        placeholder="Ex: 0709000000"
                      />
                    </div>

                    <Button
                      className="w-full h-12 rounded-2xl font-bold text-base"
                      disabled={
                        withdrawMutation.isPending ||
                        Number(amount) < MIN_WITHDRAW ||
                        Number(amount) > available ||
                        !phone.trim()
                      }
                      onClick={() => {
                        setStep("processing");
                        withdrawMutation.mutate();
                      }}
                    >
                      {withdrawMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Traitement…</>
                      ) : (
                        <><Banknote className="h-4 w-4 mr-2" /> Demander le retrait</>
                      )}
                    </Button>

                    {/* Historique retraits */}
                    {withdrawals.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Historique</p>
                        {withdrawals.map((w: any) => (
                          <div key={w.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                            <div className="flex-1">
                              <p className="text-sm font-semibold">{w.amount_fcfa.toLocaleString("fr-FR")} FCFA</p>
                              <p className="text-xs text-muted-foreground">{w.phone_number} · {new Date(w.created_at).toLocaleDateString("fr-FR")}</p>
                            </div>
                            <StatusBadge status={w.status} />
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <BottomNav />
    </div>
  );
};

export default VendeurPage;
