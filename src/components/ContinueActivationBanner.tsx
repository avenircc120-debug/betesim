import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePartnerPackStatus } from "@/hooks/usePartnerPackStatus";

/**
 * Bannière "Continuer mon activation".
 *
 * Affichée tant que l'utilisateur a un Pack Officiel acheté mais pas
 * complètement activé (logiciel non débloqué). Le tunnel ne fait pas mal :
 * on lui dit clairement où il en est et on l'invite à reprendre.
 */
export default function ContinueActivationBanner() {
  const navigate = useNavigate();
  const { data } = usePartnerPackStatus();
  if (!data || !data.hasPack || data.isComplete) return null;

  // Étape courante (texte + pourcentage)
  let stepLabel = "Étape 1/2 — Récupérer votre numéro Telegram";
  let percent = 30;
  if (data.didPartner || data.did2fa) {
    stepLabel = "Étape 2/2 — Ouvrir le Bot Telegram";
    percent = 85;
  } else if (data.isDelivered) {
    stepLabel = "Étape 2/2 — Connectez-vous à Telegram";
    percent = 60;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-amber-400/50 bg-gradient-to-br from-amber-500/15 via-card to-orange-500/10 p-4 shadow-glow space-y-3"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 shadow-glow">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Activation en cours
          </p>
          <h3 className="font-bold text-foreground text-sm leading-tight mt-0.5">
            Continuer mon activation
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{stepLabel}</p>
        </div>
      </div>

      {/* Barre de progression */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-amber-500/20">
        <div
          className="h-full rounded-full bg-amber-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      <Button
        onClick={() => navigate("/pack-partenaire")}
        className="h-11 w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-glow"
      >
        Reprendre mon activation
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </motion.div>
  );
}
