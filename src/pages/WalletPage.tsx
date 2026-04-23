import { useState } from "react";
import {
  ArrowLeftRight, Banknote, Users, RefreshCw,
  Phone, CheckCircle, XCircle, Loader2, ChevronRight,
  Clock, AlertCircle, Wallet
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

const PROVIDERS = [
  { id: "mtn", label: "MTN" },
  { id: "moov", label: "Moov" },
  { id: "orange", label: "Orange" },
];

type WithdrawStep = "form" | "confirm" | "processing" | "success" | "error";

const WalletPage = () => {
  const { user, requireAuth } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"convert" | "withdraw">("convert");



  // Convert state
  const [convertAmount, setConvertAmount] = useState("");

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState("mtn");
  const [withdrawStep, setWithdrawStep] = useState<WithdrawStep>("form");
  const [withdrawResult, setWithdrawResult] = useState<{ id: string; amount: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const { data: rate } = useQuery({
    queryKey: ["conversion-rate"],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversion_rates")
        .select("pi_to_fcfa")
        .order("effective_at", { ascending: false })
        .limit(1)
        .single();
      return data?.pi_to_fcfa ?? 1;
    },
  });

  const { data: referralCount } = useQuery({
    queryKey: ["referral-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("referrer_id", user.id)
        .eq("activated", true);
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: recentWithdrawals } = useQuery({
    queryKey: ["recent-withdrawals", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("withdrawal_requests")
        .select("id, amount_fcfa, status, created_at, provider, phone_number")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!user,
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const piAmount = Number(convertAmount);
      if (piAmount <= 0 || piAmount > (profile?.pi_balance ?? 0))
        throw new Error("Montant invalide ou solde insuffisant");
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/convert-pi`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ amount_pi: piAmount, timestamp: Date.now() }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erreur de conversion");
      return result;
    },
    onSuccess: (data) => {
      toast.success(`${data.amount_pi} π convertis en ${data.amount_fcfa.toLocaleString("fr-FR")} FCFA !`);
      setConvertAmount("");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const fcfaAmount = Number(withdrawAmount);
      if (fcfaAmount <= 0) throw new Error("Montant invalide");
      const _locked1 = (profile as any)?.fcfa_locked_balance ?? 0;
      const _withdrawable1 = (profile?.fcfa_balance ?? 0) - _locked1;
      if (_withdrawable1 < fcfaAmount) throw new Error(`Solde retraitable insuffisant. Disponible : ${_withdrawable1.toLocaleString("fr-FR")} FCFA (${_locked1.toLocaleString("fr-FR")} FCFA bloqués — réachat SIM uniquement).`);
      if (!phone.trim() || phone.length < 8) throw new Error("Numéro invalide");

      if (!user) throw new Error("Non connecté");
      const { data: result, error } = await supabase.functions.invoke("request-withdrawal", {
        body: {
          user_id: user.uid ?? user.id,
          amount_fcfa: fcfaAmount,
          phone_number: phone.trim(),
          provider,
        },
      });
      if (error) {
        let detail: string | undefined;
        try {
          const ctx: any = (error as any).context;
          if (ctx?.response) { const b = await ctx.response.clone().json(); detail = b?.error || b?.message; }
        } catch {}
        throw new Error(detail || error.message || "Erreur de retrait");
      }
      if (result?.success === false) throw new Error(result?.error || "Erreur de retrait");
      return result;
    },
    onSuccess: (data) => {
      setWithdrawResult({ id: data.withdrawal_id, amount: Number(withdrawAmount) });
      setWithdrawStep("success");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["recent-withdrawals"] });
    },
    onError: (e: Error) => {
      setErrorMsg(e.message);
      setWithdrawStep("error");
    },
  });

  const handleWithdrawSubmit = () => {
    const fcfaAmount = Number(withdrawAmount);
    if (fcfaAmount <= 0 || !phone.trim() || phone.length < 8) return;
    const _lockedW = (profile as any)?.fcfa_locked_balance ?? 0;
    const _withdrawableW = (profile?.fcfa_balance ?? 0) - _lockedW;
    if (_withdrawableW < fcfaAmount) {
      toast.error(`Solde retraitable insuffisant. Disponible : ${_withdrawableW.toLocaleString("fr-FR")} FCFA (${_lockedW.toLocaleString("fr-FR")} FCFA bloqués — réachat SIM uniquement).`);
      return;
    }
    setWithdrawStep("confirm");
  };

  const handleWithdrawConfirm = () => {
    setWithdrawStep("processing");
    withdrawMutation.mutate();
  };

  const resetWithdraw = () => {
    setWithdrawStep("form");
    setWithdrawAmount("");
    setPhone("");
    setErrorMsg("");
    setWithdrawResult(null);
  };

  const convertFcfa = Number(convertAmount || 0) * (rate ?? 1);
  const _locked = (profile as any)?.fcfa_locked_balance ?? 0;
  const _withdrawable = (profile?.fcfa_balance ?? 0) - _locked;
  const fcfaAfterWithdraw = _withdrawable - Number(withdrawAmount || 0);

  const statusStyle: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  const statusLabel: Record<string, string> = {
    pending: "En attente",
    completed: "Complété",
    failed: "Échoué",
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-5">

        {/* Balance card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl gradient-hero p-6 text-primary-foreground shadow-glow"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-primary-foreground/70" />
              <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">Portefeuille</p>
            </div>
            <p className="text-4xl font-bold tracking-tight">
              {(profile?.pi_balance ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} π
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
              <div>
                <p className="text-xs text-primary-foreground/60">Solde FCFA</p>
                <p className="text-lg font-bold">{(profile?.fcfa_balance ?? 0).toLocaleString("fr-FR")}</p>
                {((profile as any)?.fcfa_locked_balance ?? 0) > 0 && (
                  <p className="text-[10px] text-primary-foreground/50">
                    dont {((profile as any)?.fcfa_locked_balance ?? 0).toLocaleString("fr-FR")} bloqués
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-primary-foreground/60">Taux</p>
                <p className="text-lg font-bold">1π = {rate ?? 1}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-primary-foreground/60">Filleuls</p>
                <p className="text-lg font-bold">{referralCount ?? 0}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1.5">
          {(["convert", "withdraw"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); resetWithdraw(); }}
              className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {tab === "convert" ? (
                <><ArrowLeftRight className="h-4 w-4" /> Convertir π</>
              ) : (
                <><Banknote className="h-4 w-4" /> Retirer FCFA</>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── CONVERT TAB ── */}
          {activeTab === "convert" && (
            <motion.div
              key="convert"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="rounded-2xl bg-card p-5 shadow-card space-y-5"
            >
              <h3 className="text-lg font-semibold text-foreground">Convertir π → FCFA</h3>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Montant en π
                </label>
                <Input
                  type="number"
                  value={convertAmount}
                  onChange={(e) => setConvertAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="h-14 rounded-xl text-2xl font-bold text-center"
                />
                <p className="text-xs text-muted-foreground text-right">
                  Disponible : {(profile?.pi_balance ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} π
                </p>
              </div>

              <div className="flex items-center justify-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <ArrowLeftRight className="h-4 w-4 text-primary" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Vous recevrez en FCFA
                </label>
                <div className="flex h-14 items-center justify-center rounded-xl bg-accent/10 text-2xl font-bold text-accent">
                  {convertFcfa.toLocaleString("fr-FR")} FCFA
                </div>
              </div>

              <Button
                onClick={() => requireAuth(() => convertMutation.mutate())}
                disabled={
                  convertMutation.isPending || !convertAmount ||
                  Number(convertAmount) <= 0 ||
                  Number(convertAmount) > (profile?.pi_balance ?? 0)
                }
                className="h-14 w-full rounded-2xl gradient-primary text-primary-foreground font-semibold text-base shadow-glow"
              >
                {convertMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : "Convertir maintenant"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Les FCFA seront ajoutés à votre solde instantanément
              </p>
            </motion.div>
          )}

          {/* ── WITHDRAW TAB ── */}
          {activeTab === "withdraw" && (
            <motion.div
              key="withdraw"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              className="rounded-2xl bg-card p-5 shadow-card"
            >
              <AnimatePresence mode="wait">

                {/* STEP 1 — Form */}
                {withdrawStep === "form" && (
                  <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                    <h3 className="text-lg font-semibold text-foreground">Retirer des FCFA</h3>

                    <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
                      <span className="text-sm text-muted-foreground">Solde FCFA disponible</span>
                      <span className="text-sm font-bold text-foreground">
                        {(profile?.fcfa_balance ?? 0).toLocaleString("fr-FR")} FCFA
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Montant à retirer (FCFA)
                      </label>
                      <Input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="0"
                        min="0"
                        className="h-14 rounded-xl text-2xl font-bold text-center"
                      />
                      {Number(withdrawAmount) > 0 && (
                        <p className={`text-xs text-right font-medium ${fcfaAfterWithdraw < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          Restant : {fcfaAfterWithdraw.toLocaleString("fr-FR")} FCFA
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Opérateur Mobile Money
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {PROVIDERS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setProvider(p.id)}
                            className={`rounded-xl border-2 py-3 text-sm font-bold transition-all ${
                              provider === p.id
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/40"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Numéro de téléphone
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Ex: 97000000"
                          className="h-12 rounded-xl pl-10"
                          maxLength={15}
                        />
                      </div>
                    </div>

                    <Button
                      onClick={() => requireAuth(handleWithdrawSubmit)}
                      disabled={
                        !withdrawAmount || Number(withdrawAmount) <= 0 ||
                        !phone.trim() || phone.length < 8 ||
                        _withdrawable < Number(withdrawAmount)
                      }
                      className="h-14 w-full rounded-2xl gradient-primary text-primary-foreground font-semibold text-base shadow-glow"
                    >
                      Continuer <ChevronRight className="h-5 w-5 ml-1" />
                    </Button>
                  </motion.div>
                )}

                {/* STEP 2 — Confirm */}
                {withdrawStep === "confirm" && (
                  <motion.div key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                    <h3 className="text-lg font-semibold text-foreground">Confirmer le retrait</h3>

                    <div className="rounded-2xl border border-border bg-muted/30 divide-y divide-border overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-muted-foreground">Montant</span>
                        <span className="text-base font-bold text-foreground">
                          {Number(withdrawAmount).toLocaleString("fr-FR")} FCFA
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-muted-foreground">Opérateur</span>
                        <span className="text-sm font-semibold text-foreground uppercase">{provider}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-muted-foreground">Numéro</span>
                        <span className="text-sm font-semibold text-foreground">{phone}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3 bg-destructive/5">
                        <span className="text-sm text-muted-foreground">Solde après retrait</span>
                        <span className="text-sm font-bold text-destructive">
                          {(_withdrawable - Number(withdrawAmount)).toLocaleString("fr-FR")} FCFA (retraitable)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                      <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700">
                        Le paiement sera envoyé sur votre numéro {provider.toUpperCase()} via FedaPay. Vérifiez bien les informations avant de confirmer.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button variant="outline" onClick={() => setWithdrawStep("form")} className="h-12 rounded-xl">
                        Modifier
                      </Button>
                      <Button onClick={handleWithdrawConfirm} className="h-12 rounded-xl gradient-primary text-primary-foreground font-semibold shadow-glow">
                        Confirmer
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* STEP 3 — Processing */}
                {withdrawStep === "processing" && (
                  <motion.div key="processing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="py-12 flex flex-col items-center gap-4 text-center">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-foreground">Traitement en cours…</p>
                      <p className="text-sm text-muted-foreground mt-1">FedaPay envoie le paiement Mobile Money</p>
                    </div>
                  </motion.div>
                )}

                {/* STEP 4 — Success */}
                {withdrawStep === "success" && (
                  <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="py-10 flex flex-col items-center gap-4 text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 12 }}
                      className="h-20 w-20 rounded-full bg-accent/10 flex items-center justify-center"
                    >
                      <CheckCircle className="h-10 w-10 text-accent" />
                    </motion.div>
                    <div>
                      <p className="text-xl font-bold text-foreground">Retrait effectué !</p>
                      <p className="text-2xl font-bold text-accent mt-1">
                        {withdrawResult?.amount.toLocaleString("fr-FR")} FCFA
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Envoyé sur <span className="font-semibold">{phone}</span> via {provider.toUpperCase()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                        <Clock className="h-3 w-3" />
                        Peut prendre quelques minutes selon l'opérateur
                      </p>
                    </div>
                    <Button onClick={resetWithdraw} className="mt-2 h-11 rounded-xl gradient-primary text-primary-foreground font-semibold px-8">
                      Nouveau retrait
                    </Button>
                  </motion.div>
                )}

                {/* STEP 5 — Error */}
                {withdrawStep === "error" && (
                  <motion.div key="error" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="py-10 flex flex-col items-center gap-4 text-center">
                    <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
                      <XCircle className="h-10 w-10 text-destructive" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-foreground">Retrait échoué</p>
                      <p className="text-sm text-muted-foreground mt-2 max-w-[240px]">{errorMsg}</p>
                    </div>
                    <Button variant="outline" onClick={resetWithdraw} className="mt-2 h-11 rounded-xl px-8">
                      Réessayer
                    </Button>
                  </motion.div>
                )}

              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recent withdrawals */}
        {activeTab === "withdraw" && recentWithdrawals && recentWithdrawals.length > 0 && withdrawStep === "form" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-2xl bg-card p-5 shadow-card space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" /> Derniers retraits
            </h4>
            <div className="space-y-2">
              {recentWithdrawals.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {w.amount_fcfa.toLocaleString("fr-FR")} FCFA
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {w.provider?.toUpperCase()} · {w.phone_number}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[w.status] ?? "bg-muted text-muted-foreground"}`}>
                    {statusLabel[w.status] ?? w.status}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Info card */}
        {activeTab === "withdraw" && withdrawStep === "form" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Comment fonctionne le retrait ?</p>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-1.5">
                <span className="text-primary font-bold mt-0.5">1.</span>
                Convertissez d'abord vos π en FCFA (onglet Convertir)
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-primary font-bold mt-0.5">2.</span>
                Entrez le montant et votre numéro Mobile Money
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-primary font-bold mt-0.5">3.</span>
                FedaPay envoie l'argent directement sur votre téléphone
              </li>
            </ul>
          </motion.div>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default WalletPage;
