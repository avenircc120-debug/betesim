import { Cpu, CreditCard, Users, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import MachineCard, { MACHINES, MACHINE_PRICES, MachineType } from "@/components/machine/MachineCard";
import ActiveMachineDisc from "@/components/machine/ActiveMachineDisc";
import TermsOfUse from "@/components/machine/TermsOfUse";
import EsimCountryPicker from "@/components/machine/EsimCountryPicker";

type Step = "select" | "confirm";

const Machine = () => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("select");
  const [selectedMachine, setSelectedMachine] = useState<MachineType>("starter");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [esimStep, setEsimStep] = useState(false);
  const [activatedMachineType, setActivatedMachineType] = useState<MachineType | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const { data: activeMining, refetch: refetchMining } = useQuery({
    queryKey: ["active-mining", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("mining_sessions")
        .select("id, user_id, boost_type, pi_earned, started_at, ends_at, status, rate_per_hour, machine_type, reserve_balance")
        .eq("user_id", user.id)
        .eq("status", "active")
        .neq("machine_type", "referral_bonus")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    refetchInterval: 30000,
    staleTime: 25000,
  });

  const { data: referralCount } = useQuery({
    queryKey: ["referral-count-machine", user?.id],
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

  useEffect(() => {
    if (!activeMining) return;
    const creditEarnings = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/credit-mining`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        });
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        refetchMining();
      } catch {}
    };
    creditEarnings();
    const interval = setInterval(creditEarnings, 60000);
    return () => clearInterval(interval);
  }, [activeMining?.id]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get("id");
    const status = params.get("status");
    if (!transactionId || !status) return;

    window.history.replaceState({}, "", window.location.pathname);

    const savedMachine = (sessionStorage.getItem("pending_machine") as MachineType) || "starter";
    sessionStorage.removeItem("pending_machine");

    if (status === "approved") {
      (async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/activate-machine`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": anonKey,
                Authorization: `Bearer ${sessionData.session?.access_token}`,
              },
              body: JSON.stringify({
                phone_number: "fedapay",
                provider: "fedapay",
                machine_type: savedMachine,
                timestamp: Date.now(),
                fedapay_transaction_id: transactionId,
              }),
            }
          );
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Erreur activation");
          toast.success("Machine activée ! Les π arrivent progressivement.");
          queryClient.invalidateQueries({ queryKey: ["active-mining"] });
          queryClient.invalidateQueries({ queryKey: ["profile"] });
          if (savedMachine === "pro" || savedMachine === "elite") {
            setActivatedMachineType(savedMachine);
            setEsimStep(true);
          }
        } catch (e: any) {
          toast.error(e.message || "Erreur activation");
        }
      })();
    } else {
      toast.error("Paiement annulé ou refusé. Veuillez réessayer.");
    }
  }, [user]);

  const selectedMachineConfig = MACHINES.find((m) => m.id === selectedMachine)!;

  const handlePay = useCallback(async () => {
    setIsPaying(true);
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? anonKey;
      const effectiveUserId = user?.id ?? `anon_${Date.now()}`;
      sessionStorage.setItem("pending_machine", selectedMachine);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fedapay-create-transaction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: MACHINE_PRICES[selectedMachine],
            description: `Activation machine ${selectedMachineConfig.name} - ${MACHINE_PRICES[selectedMachine].toLocaleString("fr-FR")} FCFA`,
            user_id: effectiveUserId,
            payment_type: "machine_activation",
            callback_url: `${window.location.origin}/machine`,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Erreur création paiement");
      window.location.href = data.payment_url;
    } catch (e: any) {
      setIsPaying(false);
      sessionStorage.removeItem("pending_machine");
      toast.error(e.message || "Erreur paiement. Réessayez.");
    }
  }, [user, selectedMachine, selectedMachineConfig]);

  const reserveBalance = activeMining?.reserve_balance ?? 0;
  const reserveEmpty = reserveBalance < 0.01;
  const ratePerHour = reserveEmpty ? 0 : (activeMining?.rate_per_hour ?? 1.38);
  const ratePerSecond = ratePerHour / 3600;
  const machineType = (activeMining?.machine_type as MachineType) ?? "starter";

  // Compteur live : démarre depuis la valeur DB et s'incrémente chaque seconde
  const [liveEarned, setLiveEarned] = useState<number>(activeMining?.pi_earned ?? 0);

  // Resynchronisation avec la DB à chaque refetch (toutes les 30s)
  useEffect(() => {
    if (activeMining?.pi_earned !== undefined) {
      setLiveEarned(activeMining.pi_earned);
    }
  }, [activeMining?.pi_earned]);

  // Tick chaque seconde : ajoute ratePerSecond si la réserve n'est pas vide
  useEffect(() => {
    if (reserveEmpty || ratePerSecond <= 0) return;
    const ticker = setInterval(() => {
      setLiveEarned((prev) => prev + ratePerSecond);
    }, 1000);
    return () => clearInterval(ticker);
  }, [ratePerSecond, reserveEmpty]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-6 px-4 pt-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Machine de minage</h1>
          <p className="text-sm text-muted-foreground">
            {activeMining ? "Votre machine tourne en permanence" : "Choisissez votre machine et activez-la"}
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-card">
          <div>
            <p className="text-xs text-muted-foreground">Portefeuille π</p>
            <p className="text-2xl font-bold text-foreground">
              {(profile?.pi_balance ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}{" "}
              <span className="text-sm text-primary">π</span>
            </p>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {activeMining ? (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <ActiveMachineDisc
                machineType={machineType}
                piEarned={liveEarned}
                ratePerHour={ratePerHour}
                reserveEmpty={reserveEmpty}
              />
              <div className="rounded-2xl bg-card p-5 shadow-card space-y-4">
                {reserveEmpty && (
                  <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-center space-y-1">
                    <p className="text-sm font-semibold text-foreground">⚠️ Vitesse : {ratePerHour.toFixed(4)} π/h</p>
                    <p className="text-xs text-muted-foreground">Votre machine tourne toujours mais votre vitesse est à zéro. Parrainez un ami pour l'augmenter !</p>
                  </motion.div>
                )}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{reserveEmpty ? "Augmentez votre vitesse via le parrainage" : "Boostez votre vitesse !"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Chaque filleul augmente votre vitesse de minage</p>
                  <p className="text-xs text-muted-foreground">{referralCount ?? 0} filleul{(referralCount ?? 0) > 1 ? "s" : ""} actif{(referralCount ?? 0) > 1 ? "s" : ""}</p>
                </div>
              </div>
              <AnimatePresence>
                {esimStep && activatedMachineType && (
                  <motion.div key="esim" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-2xl bg-card p-5 shadow-card space-y-4">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">🎁 Votre numéro virtuel est prêt</p>
                      <p className="text-xs text-muted-foreground">Choisissez votre pays pour recevoir votre numéro</p>
                    </div>
                    <EsimCountryPicker service="whatsapp" machineType={activatedMachineType} userId={user?.id ?? "guest"} onDelivered={() => setEsimStep(false)} />
                    {activatedMachineType === "elite" && (
                      <div className="pt-2 border-t border-border">
                        <EsimCountryPicker service="telegram" machineType={activatedMachineType} userId={user?.id ?? "guest"} onDelivered={() => setEsimStep(false)} />
                      </div>
                    )}
                    <button type="button" onClick={() => setEsimStep(false)} className="w-full text-center text-xs text-muted-foreground underline underline-offset-2 pt-1">
                      Faire ça plus tard (vous recevrez une notification)
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : step === "select" ? (
            <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Choisissez votre machine</h2>
                {MACHINES.map((m) => (
                  <MachineCard key={m.id} machine={m} selected={selectedMachine === m.id} onSelect={setSelectedMachine} />
                ))}
              </div>
              <Button onClick={() => { setTermsAccepted(false); setStep("confirm"); }} className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-semibold text-base shadow-glow">
                Choisir la machine {selectedMachineConfig.name}
              </Button>
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Comment ça marche</h3>
                {[
                  { icon: CreditCard, title: "1. Une seule machine", desc: "Choisissez votre machine : Starter (2 500F), Pro (3 500F) ou Elite (4 500F)", color: "gradient-primary" },
                  { icon: Cpu, title: "2. Disque permanent", desc: "Votre disque tourne pour toujours, même si la vitesse est à zéro", color: "gradient-accent" },
                  { icon: Users, title: "3. Parrainez pour gagner plus", desc: "Seul le parrainage augmente votre vitesse et accélère vos gains", color: "gradient-gold" },
                ].map((item) => (
                  <div key={item.title} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.color}`}>
                      <item.icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <button type="button" onClick={() => setStep("select")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Changer de machine
              </button>
              <div className={`rounded-2xl p-5 shadow-card bg-gradient-to-br ${selectedMachineConfig.gradientClass} text-white`}>
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow">
                    <selectedMachineConfig.Icon className="h-7 w-7 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Machine sélectionnée</p>
                    <p className="text-xl font-bold">{selectedMachineConfig.name}</p>
                    <p className="text-sm opacity-80">{selectedMachineConfig.subtitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{MACHINE_PRICES[selectedMachine].toLocaleString("fr-FR")}</p>
                    <p className="text-xs opacity-80">FCFA</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-card p-5 shadow-card">
                <TermsOfUse accepted={termsAccepted} onAcceptChange={setTermsAccepted} />
              </div>
              <Button onClick={handlePay} disabled={!termsAccepted || isPaying} className="h-14 w-full rounded-xl gradient-primary text-primary-foreground font-bold text-base shadow-glow disabled:opacity-40">
                {isPaying ? (
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    <span>Redirection vers FedaPay…</span>
                  </div>
                ) : (
                  <>
                    <CreditCard className="h-5 w-5 mr-2" />
                    Payer {MACHINE_PRICES[selectedMachine].toLocaleString("fr-FR")} FCFA
                  </>
                )}
              </Button>
              {!termsAccepted && (
                <p className="text-center text-xs text-muted-foreground">Acceptez les conditions pour continuer</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
};

export default Machine;
