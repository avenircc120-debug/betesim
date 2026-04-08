import { Wallet, ChevronRight, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Tables } from "@/integrations/supabase/types";
import { motion } from "framer-motion";

interface WalletBannerProps {
  profile: Tables<"profiles"> | null;
}

const WalletBanner = ({ profile }: WalletBannerProps) => {
  const navigate = useNavigate();

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate("/wallet")}
      className="relative w-full overflow-hidden rounded-2xl gradient-hero p-5 text-left shadow-glow"
    >
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/5" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 text-primary-foreground/70">
          <Wallet className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Solde total</span>
        </div>
        <p className="mt-1 text-3xl font-bold tracking-tight text-primary-foreground">
          {(profile?.pi_balance ?? 0).toLocaleString("fr-FR")} π
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary-foreground/60" />
            <span className="text-sm font-semibold text-primary-foreground/90">
              {(profile?.fcfa_balance ?? 0).toLocaleString("fr-FR")} FCFA
            </span>
          </div>
          <ChevronRight className="h-5 w-5 text-primary-foreground/50" />
        </div>
      </div>
    </motion.button>
  );
};

export default WalletBanner;
