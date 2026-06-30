import { ShoppingBag, TrendingUp, Trophy, Download, Phone, ArrowUpRight, Sparkles, Users, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import WalletBanner from "@/components/WalletBanner";
import ContinueActivationBanner from "@/components/ContinueActivationBanner";
import NotificationCenter from "@/components/NotificationCenter";
import BottomNav from "@/components/BottomNav";
import ShareButtons from "@/components/ShareButtons";
import { useProfile } from "@/hooks/useProfile";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const fadeUp = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.25 },
};

const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile } = useProfile();

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

  const { data: purchasedCount } = useQuery({
    queryKey: ["purchased-numbers-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("type", "number_purchase")
        .eq("status", "validated");
      return count ?? 0;
    },
    enabled: !!user,
  });

  const isPartner = !!(profile as any)?.is_partner;
  const productionUrl = "https://betesim.vercel.app";
  const referralLink = `${productionUrl}/auth?ref=${profile?.referral_code ?? ""}`;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-5">

        {/* Header */}
        <motion.div {...fadeUp} className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Bienvenue 👋</p>
            <h1 className="text-2xl font-bold text-foreground">
              {(() => {
                if (!user) return "Invité";
                const p: any = profile ?? {};
                if (p.username) return p.username;
                if (p.display_name) return p.display_name;
                if (user.email) return user.email.split("@")[0];
                const phone = user.phoneNumber || p.phone_number;
                if (phone) return `Utilisateur ••${phone.slice(-4)}`;
                return "Utilisateur";
              })()}
            </h1>
            {!user && (
              <button
                onClick={() => navigate("/login")}
                className="mt-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
              >
                Se connecter pour acheter un numéro
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-primary shadow-glow">
              <Phone className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
        </motion.div>

        {/* Wallet */}
        <motion.div {...fadeUp} transition={{ delay: 0.05 }}>
          <WalletBanner profile={profile ?? null} />
        </motion.div>

        {/* Reprise tunnel si commencé */}
        {user && (
          <motion.div {...fadeUp} transition={{ delay: 0.07 }}>
            <ContinueActivationBanner />
          </motion.div>
        )}

        {/* CTA principal — Achat SIM Virtuelle (pleine largeur) */}
        <motion.div {...fadeUp} transition={{ delay: 0.1 }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/boutique")}
            className="group flex w-full items-center gap-4 rounded-2xl gradient-primary p-5 shadow-glow text-left"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20">
              <Smartphone className="h-7 w-7 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-white leading-tight">Acheter une SIM Virtuelle</p>
              <p className="text-sm text-white/80 mt-0.5">WhatsApp, TikTok, Telegram… dès 2 000 FCFA</p>
            </div>
            <ArrowUpRight className="h-6 w-6 text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </motion.button>
        </motion.div>

        {/* Stats */}
        <motion.div {...fadeUp} transition={{ delay: 0.15 }} className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-card p-4 shadow-card text-center">
            <Phone className="mx-auto mb-1.5 h-5 w-5 text-primary" />
            <p className="text-xl font-bold text-foreground">{purchasedCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">SIM achetées</p>
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

        {/* Raccourcis */}
        <motion.div {...fadeUp} transition={{ delay: 0.2 }} className="grid grid-cols-3 gap-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/boutique")}
            className="flex flex-col items-center gap-3 rounded-2xl bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary shadow-glow">
              <ShoppingBag className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">Boutique</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/wallet")}
            className="flex flex-col items-center gap-3 rounded-2xl bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-accent">
              <TrendingUp className="h-6 w-6 text-accent-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">Retrait</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/leaderboard")}
            className="flex flex-col items-center gap-3 rounded-2xl bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-gold">
              <Trophy className="h-6 w-6 text-gold-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">Classement</span>
          </motion.button>
        </motion.div>

        {/* Installer l'app */}
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

        {/* Parrainage — visible seulement si partenaire */}
        {isPartner && (
          <motion.div {...fadeUp} transition={{ delay: 0.3 }} className="rounded-2xl bg-card p-5 shadow-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold">
                <Users className="h-5 w-5 text-gold-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Mon lien de parrainage</h3>
                <p className="text-sm text-muted-foreground">Gagnez des commissions sur chaque achat de vos filleuls</p>
              </div>
            </div>
            <ShareButtons referralLink={referralLink} />
          </motion.div>
        )}

      </div>
      <BottomNav />
    </div>
  );
};

export default Index;
