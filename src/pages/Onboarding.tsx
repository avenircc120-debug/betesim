import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck, User, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const Onboarding = () => {
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [deposit, setDeposit] = useState("");
  const [withdrawal, setWithdrawal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = params.get("redirect") || "/";

  // Pas connecté → login
  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/login?redirect=${encodeURIComponent(`/onboarding?redirect=${encodeURIComponent(redirectTo)}`)}`);
    }
  }, [authLoading, user, navigate, redirectTo]);

  // Profil déjà complet → on dégage
  useEffect(() => {
    if (!profileLoading && profile) {
      const p: any = profile;
      if (p.full_name && p.deposit_number && p.withdrawal_number) {
        navigate(redirectTo, { replace: true });
      } else {
        // Pré-remplit ce qui existe
        if (p.full_name && !fullName) setFullName(p.full_name);
        if (p.deposit_number && !deposit) setDeposit(p.deposit_number);
        if (p.withdrawal_number && !withdrawal) setWithdrawal(p.withdrawal_number);
        if (!fullName && p.display_name) setFullName(p.display_name);
      }
    }
  }, [profile, profileLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!user) return;
    if (fullName.trim().length < 2) return toast.error("Indiquez votre Nom & Prénom");
    if (deposit.replace(/\D/g, "").length < 6) return toast.error("Numéro de dépôt invalide");
    if (withdrawal.replace(/\D/g, "").length < 6) return toast.error("Numéro de retrait invalide");

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("profile-update", {
        body: {
          user_id: user.id,
          full_name: fullName.trim(),
          deposit_number: deposit.trim(),
          withdrawal_number: withdrawal.trim(),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erreur");
      toast.success("Profil enregistré ✅");
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      navigate(redirectTo, { replace: true });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || profileLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl gradient-primary shadow-glow flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Complétez votre profil</h1>
          <p className="text-sm text-muted-foreground px-4">
            Une seule fois — ces informations nous permettent de vous payer rapidement vos retraits.
          </p>
        </div>

        <div className="rounded-2xl bg-card p-5 shadow-card space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name" className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4 text-primary" /> Nom & Prénom
            </Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex : Koffi Jean"
              className="h-12 rounded-xl text-base"
              autoComplete="name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deposit" className="flex items-center gap-2 text-sm font-semibold">
              <ArrowDownToLine className="h-4 w-4 text-accent" /> Numéro de Dépôt
            </Label>
            <Input
              id="deposit"
              type="tel"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="Ex : 90 00 00 00"
              className="h-12 rounded-xl text-base"
              autoComplete="tel"
              inputMode="tel"
            />
            <p className="text-xs text-muted-foreground">Le numéro Mobile Money depuis lequel vous payez.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="withdrawal" className="flex items-center gap-2 text-sm font-semibold">
              <ArrowUpFromLine className="h-4 w-4 text-gold" /> Numéro de Retrait
            </Label>
            <Input
              id="withdrawal"
              type="tel"
              value={withdrawal}
              onChange={(e) => setWithdrawal(e.target.value)}
              placeholder="Ex : 90 00 00 00"
              className="h-12 rounded-xl text-base"
              autoComplete="tel"
              inputMode="tel"
            />
            <p className="text-xs text-muted-foreground">Le numéro où vous recevrez vos commissions.</p>
          </div>

          <Button
            onClick={submit}
            disabled={submitting}
            className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitting ? "Enregistrement…" : "Continuer"}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground px-6">
          🔒 Vos informations restent privées et ne servent qu'au paiement de vos commissions.
        </p>
      </motion.div>
    </div>
  );
};

export default Onboarding;
