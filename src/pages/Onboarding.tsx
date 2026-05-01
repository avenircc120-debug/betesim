import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck, User } from "lucide-react";
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
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const redirectTo = params.get("redirect") || "/";

  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/login?redirect=${encodeURIComponent(`/onboarding?redirect=${encodeURIComponent(redirectTo)}`)}`);
    }
  }, [authLoading, user, navigate, redirectTo]);

  useEffect(() => {
    if (!profileLoading && profile) {
      const p: any = profile;
      // Si l'utilisateur a déjà un username, on le redirige
      if (p.username) {
        navigate(redirectTo, { replace: true });
      } else if (p.display_name && !username) {
        setUsername(p.display_name);
      }
    }
  }, [profile, profileLoading]); // eslint-disable-line

  const submit = async () => {
    if (!user) return;
    if (username.trim().length < 2) return toast.error("Choisissez un nom d'utilisateur (min. 2 caractères)");
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ username: username.trim() })
        .eq("id", user.id);
      if (error) throw error;
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
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Bienvenue sur Betesim</h1>
          <p className="text-sm text-muted-foreground px-4">
            Choisissez un nom d'utilisateur pour continuer.
          </p>
        </div>

        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4 text-primary" /> Nom d'utilisateur
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ex : Koffi123"
              className="h-12 rounded-xl text-base"
              autoComplete="username"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          <Button
            onClick={submit}
            disabled={submitting || username.trim().length < 2}
            className="h-12 w-full rounded-xl font-bold"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitting ? "Enregistrement…" : "Continuer →"}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground px-6">
          🔒 Vos données restent privées et sécurisées.
        </p>
      </motion.div>
    </div>
  );
};

export default Onboarding;
