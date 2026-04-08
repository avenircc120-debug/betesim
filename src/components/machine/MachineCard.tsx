import { motion } from "framer-motion";
import { Check, Zap, Flame, Crown, Smartphone, MessageCircle } from "lucide-react";

export type MachineType = "starter" | "pro" | "elite";

interface MachineConfig {
  id: MachineType;
  name: string;
  subtitle: string;
  price: number;
  Icon: typeof Zap;
  gradientClass: string;
  ringColors: [string, string];
  bgPattern: string;
  features: string[];
  badge?: string;
}

export const MACHINES: MachineConfig[] = [
  {
    id: "starter",
    name: "Starter",
    subtitle: "Simple & efficace",
    price: 2500,
    Icon: Zap,
    gradientClass: "from-sky-500 to-blue-600",
    ringColors: ["hsl(200, 80%, 50%)", "hsl(210, 90%, 55%)"],
    bgPattern: "radial-gradient(circle at 80% 20%, hsl(200 80% 50% / 0.15), transparent 50%)",
    features: ["Minage automatique", "Gains progressifs", "Idéal pour débuter"],
  },
  {
    id: "pro",
    name: "Pro",
    subtitle: "Le meilleur rapport qualité/prix",
    price: 3500,
    Icon: Flame,
    gradientClass: "from-violet-500 to-purple-600",
    ringColors: ["hsl(270, 80%, 55%)", "hsl(280, 85%, 60%)"],
    bgPattern: "radial-gradient(circle at 80% 20%, hsl(270 80% 55% / 0.15), transparent 50%)",
    features: ["Minage automatique", "Gains plus élevés", "Numéro WhatsApp virtuel"],
    badge: "Populaire",
  },
  {
    id: "elite",
    name: "Elite",
    subtitle: "Toutes les options, prestige maximum",
    price: 4500,
    Icon: Crown,
    gradientClass: "from-amber-500 to-orange-500",
    ringColors: ["hsl(40, 95%, 50%)", "hsl(25, 95%, 55%)"],
    bgPattern: "radial-gradient(circle at 80% 20%, hsl(40 95% 50% / 0.2), transparent 50%)",
    features: ["Minage automatique", "Gains premium", "WhatsApp + Telegram virtuels"],
    badge: "Premium",
  },
];

// Prix affichés sur le bouton de paiement dans Machine.tsx
export const MACHINE_PRICES: Record<MachineType, number> = {
  starter: 2500,
  pro:     3500,
  elite:   4500,
};

interface MachineCardProps {
  machine: MachineConfig;
  selected: boolean;
  onSelect: (id: MachineType) => void;
}

// Icônes pour les features spéciales
const featureIcon = (feature: string) => {
  if (feature.toLowerCase().includes("whatsapp")) return <Smartphone className="h-3 w-3" />;
  if (feature.toLowerCase().includes("telegram")) return <MessageCircle className="h-3 w-3" />;
  return <Check className="h-3 w-3" strokeWidth={3} />;
};

const MachineCard = ({ machine, selected, onSelect }: MachineCardProps) => {
  const IconComponent = machine.Icon;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(machine.id)}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative w-full overflow-hidden rounded-2xl border-2 p-5 text-left transition-all duration-200 ${
        selected
          ? "border-primary bg-card shadow-lg ring-2 ring-primary/20"
          : "border-border bg-card hover:border-primary/50 hover:shadow-md"
      }`}
      style={{ background: selected ? machine.bgPattern : undefined }}
    >
      {/* Selection badge */}
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary shadow-lg"
        >
          <Check className="h-4 w-4 text-primary-foreground" strokeWidth={3} />
        </motion.div>
      )}

      <div className="flex items-center gap-4">
        {/* Icon */}
        <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${machine.gradientClass} shadow-lg`}>
          <IconComponent className="h-7 w-7 text-white" strokeWidth={2.5} />
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
        </div>

        {/* Name + subtitle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-foreground">{machine.name}</h3>
            {machine.badge && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                machine.id === "elite"
                  ? "bg-amber-500/20 text-amber-600"
                  : "bg-violet-500/20 text-violet-600"
              }`}>
                {machine.badge}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{machine.subtitle}</p>
        </div>

        {/* Price */}
        <div className="shrink-0 text-right">
          <span className={`inline-block rounded-lg px-3 py-1.5 text-sm font-bold ${
            selected
              ? `bg-gradient-to-r ${machine.gradientClass} text-white shadow-md`
              : "bg-muted text-foreground"
          }`}>
            {machine.price.toLocaleString("fr-FR")} F
          </span>
        </div>
      </div>

      {/* Features */}
      <div className="mt-4 flex flex-wrap gap-2">
        {machine.features.map((f) => (
          <div
            key={f}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
              selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {featureIcon(f)}
            <span>{f}</span>
          </div>
        ))}
      </div>
    </motion.button>
  );
};

export default MachineCard;
