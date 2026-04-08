import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Sparkles, Mail, Lock, ArrowRight, KeyRound } from "lucide-react";

const Auth = () => {
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const refFromUrl = new URLSearchParams(window.location.search).get("ref") ?? "";
  const [referralCode, setReferralCode] = useState(refFromUrl);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Un email de réinitialisation a été envoyé !");
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { referral_code: referralCode.trim() || undefined },
      },
    });
    if (error) toast.error(error.message);
    else toast.success("Vérifiez votre email pour confirmer votre compte !");

    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="mb-10 flex flex-col items-center gap-3">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="flex h-20 w-20 items-center justify-center rounded-3xl gradient-hero shadow-glow"
          >
            <span className="text-4xl font-bold text-primary-foreground">π</span>
          </motion.div>
          <h1 className="text-4xl font-bold tracking-tight text-gradient-primary">PI REAL</h1>
          <p className="text-center text-sm text-muted-foreground">
            La plateforme de minage Pi la plus fiable d'Afrique
          </p>
        </div>

        <div className="rounded-2xl bg-card p-6 shadow-card">
          <h2 className="mb-6 text-center text-xl font-semibold text-foreground">
            {isForgot ? "Mot de passe oublié" : "Créer votre compte"}
          </h2>

          {isForgot ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Votre email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl pl-10"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-semibold text-base gap-2"
              >
                {loading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                ) : (
                  <>
                    Envoyer le lien
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => setIsForgot(false)}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="font-semibold text-primary">Retour</span>
                </button>
              </div>
            </form>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Votre email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 rounded-xl pl-10"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Votre mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 rounded-xl pl-10"
                  />
                </div>

                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="relative"
                >
                  <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold" />
                  <Input
                    type="text"
                    placeholder="Code de parrainage (optionnel)"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    className="h-12 rounded-xl pl-10"
                    maxLength={20}
                  />
                </motion.div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-semibold text-base gap-2"
                >
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  ) : (
                    <>
                      Créer mon compte
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => setIsForgot(true)}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground flex items-center gap-1 mx-auto"
                >
                  <KeyRound className="h-3 w-3" />
                  Mot de passe oublié ?
                </button>
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          En continuant, vous acceptez nos conditions d'utilisation
        </p>
      </motion.div>
    </div>
  );
};

export default Auth;
