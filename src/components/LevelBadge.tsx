import { getLevelInfo, getNextLevel, getLevelProgress } from "@/lib/levels";
import { motion } from "framer-motion";

interface LevelBadgeProps {
  piBalance: number;
  showProgress?: boolean;
}

const LevelBadge = ({ piBalance, showProgress = false }: LevelBadgeProps) => {
  const level = getLevelInfo(piBalance);
  const next = getNextLevel(piBalance);
  const progress = getLevelProgress(piBalance);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{level.emoji}</span>
        <span className={`text-sm font-bold ${level.color}`}>{level.name}</span>
      </div>
      {showProgress && next && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="h-full rounded-full gradient-primary"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {piBalance.toLocaleString("fr-FR")} / {next.minPi.toLocaleString("fr-FR")} π pour {next.emoji} {next.name}
          </p>
        </div>
      )}
    </div>
  );
};

export default LevelBadge;
