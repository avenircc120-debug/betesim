import { Zap, TrendingUp, Users, ArrowUpRight, Sparkles, Trophy, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import WalletBanner from "@/components/WalletBanner";
import NotificationCenter from "@/components/NotificationCenter";
import BottomNav from "@/components/BottomNav";
import { getLevelInfo } from "@/lib/levels";
import ShareButtons from "@/components/ShareButtons";
import { useProfile } from "@/hooks/useProfile";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile } = useProfile();

  const { data: activeMining } = useQuery({
    queryKey: ["active-mining", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("mining_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
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

  const productionUrl = "https://pi-reel.vercel.app";
  const referralLink = `${productionUrl}/auth?ref=${profile?.referral_code ?? ""}`;

  const miningProgress = activeMining
    ? Math.min(
        ((Date.now() - new Date(activeMining.started_at).getTime()) /
          (new Date(activeMining.ends_at).getTime() - new Date(activeMining.started_at).getTime())) * 100,
        100
      )
    : 0;

  const daysRemaining = activeMining
    ? Math.max(0, Math.ceil((new Date(activeMining.ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-5">
        {/* Header */}
        <motion.div {...fadeUp} className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Bienvenue 👋</p>
            <h1 className="text-2xl font-bold text-foreground">{profile?.username ?? "Utilisateur"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-primary shadow-glow">
              <span className="text-lg font-bold text-primary-foreground">π</span>
            </div>
          </div>
        </motion.div>

        {/* Wallet Banner */}
        <motion.div {...fadeUp} transition={{ delay: 0.05 }}>
          <WalletBanner profile={profile ?? null} />
        </motion.div>

        {/* Mining status */}
        <motion.div {...fadeUp} transition={{ delay: 0.1 }}>
          {activeMining ? (
            <div className="rounded-2xl bg-card p-5 shadow-card space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-3 w-3 items-center justify-center">
                    <span className="absolute h-full w-full animate-ping rounded-full bg-accent/50" />
                    <span className="relative h-2 w-2 rounded-full bg-accent" />
                  </div>
                  <span className="font-semibold text-accent">Minage actif</span>
                </div>
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                  En cours
                </span>
              </div>
              <div className="flex items-center gap-4">
                {/* Spinning speed disc */}
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                  <svg className="absolute h-full w-full animate-spin-slow" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke="url(#speedGradientHome)"
                      strokeWidth="5"
                      strokeDasharray="160 54"
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="speedGradientHome" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="hsl(var(--primary))" />
                        <stop offset="100%" stopColor="hsl(var(--accent))" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="text-center z-10">
                    <p className="text-sm font-bold text-foreground">{(activeMining.rate_per_hour ?? 1.38).toFixed(1)}</p>
                    <p className="text-[9px] text-muted-foreground">π/h</p>
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-bold text-foreground">
                    {(activeMining.pi_earned ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} <span className="text-primary">π gagnés</span>
                  </p>
                  <p className="text-xs text-muted-foreground">⚡ Crédité automatiquement</p>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => navigate("/machine")}
              className="group flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-primary/20 bg-primary/5 p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary shadow-glow">
                <Zap className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-foreground">Démarrer le minage</p>
                <p className="text-sm text-muted-foreground">Activez et gagnez des π automatiquement</p>
              </div>
              <ArrowUpRight className="ml-auto h-5 w-5 text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          )}
        </motion.div>

        {/* Stats grid */}
        <motion.div {...fadeUp} transition={{ delay: 0.15 }} className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-card p-4 shadow-card text-center">
            <TrendingUp className="mx-auto mb-1.5 h-5 w-5 text-primary" />
            <p className="text-xl font-bold text-foreground">
              {(profile?.pi_balance ?? 0).toLocaleString("fr-FR")}
            </p>
            <p className="text-xs text-muted-foreground">π minés</p>
          </div>
          <div className="rounded-2xl bg-card p-4 shadow-card text-center">
            <Users className="mx-auto mb-1.5 h-5 w-5 text-accent" />
            <p className="text-xl font-bold text-foreground">{referralCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">Filleuls</p>
          </div>
          <div className="rounded-2xl bg-card p-4 shadow-card text-center">
            <Sparkles className="mx-auto mb-1.5 h-5 w-5 text-gold" />
            <p className="text-xl font-bold text-foreground">
              {(profile?.fcfa_balance ?? 0).toLocaleString("fr-FR")}
            </p>
            <p className="text-xs text-muted-foreground">FCFA</p>
          </div>
        </motion.div>

        {/* Speed disc */}
        <motion.div {...fadeUp} transition={{ delay: 0.17 }} className="rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-center gap-4">
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
              <svg className="absolute h-full w-full animate-spin-slow" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
                <circle
                  cx="40" cy="40" r="34" fill="none"
                  stroke="url(#speedGradientLevel)"
                  strokeWidth="5"
                  strokeDasharray="160 54"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="speedGradientLevel" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(var(--accent))" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="text-center z-10">
                <p className="text-sm font-bold text-foreground">{activeMining ? (activeMining.rate_per_hour ?? 1.38).toFixed(1) : "0.0"}</p>
                <p className="text-[9px] text-muted-foreground">π/h</p>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{getLevelInfo(profile?.pi_balance ?? 0).emoji}</span>
                <span className={`text-sm font-bold ${getLevelInfo(profile?.pi_balance ?? 0).color}`}>{getLevelInfo(profile?.pi_balance ?? 0).name}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {activeMining ? "Minage actif — vitesse en cours" : "Activez la machine pour commencer"}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Quick actions */}
        <motion.div {...fadeUp} transition={{ delay: 0.2 }} className="grid grid-cols-3 gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/machine")}
            className="flex flex-col items-center gap-3 rounded-2xl bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary shadow-glow">
              <Zap className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">Machine</span>
            </div>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/wallet")}
            className="flex flex-col items-center gap-3 rounded-2xl bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-accent">
              <TrendingUp className="h-6 w-6 text-accent-foreground" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">Convertir</span>
            </div>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/leaderboard")}
            className="flex flex-col items-center gap-3 rounded-2xl bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-gold">
              <Trophy className="h-6 w-6 text-gold-foreground" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">Classement</span>
            </div>
          </motion.button>
        </motion.div>

        {/* Install button */}
        <motion.div {...fadeUp} transition={{ delay: 0.25 }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/install")}
            className="flex w-full items-center gap-4 rounded-2xl bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl gradient-primary shadow-glow">
              <Download className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="text-left flex-1">
              <p className="font-semibold text-foreground">Installer l'application</p>
              <p className="text-sm text-muted-foreground">Accédez comme une vraie app mobile</p>
            </div>
            <ArrowUpRight className="h-5 w-5 text-primary" />
          </motion.button>
        </motion.div>

        {/* Referral */}
        <motion.div {...fadeUp} transition={{ delay: 0.3 }} className="rounded-2xl bg-card p-5 shadow-card space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold">
              <Users className="h-5 w-5 text-gold-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Parrainez vos amis</h3>
              <p className="text-sm text-muted-foreground">Augmentez la vitesse de votre minage</p>
            </div>
          </div>
          <ShareButtons referralLink={referralLink} />
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Index;
