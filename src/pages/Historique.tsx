
import { useState } from "react";
import { Download, ArrowUpRight, Users, RefreshCw, Phone, FileText } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

const filters = ["Tout", "Achat numéro", "Parrainage", "Retrait"] as const;

const typeConfig: Record<string, { icon: typeof Download; color: string; label: string }> = {
  deposit: { icon: Download, color: "gradient-primary", label: "Dépôt" },
  withdrawal: { icon: ArrowUpRight, color: "gradient-accent", label: "Retrait" },
  conversion: { icon: RefreshCw, color: "gradient-primary", label: "Conversion" },
  referral_bonus: { icon: Users, color: "gradient-gold", label: "Commission parrainage" },
  number_purchase: { icon: Phone, color: "gradient-primary", label: "Achat numéro" },
  partner_activation: { icon: Users, color: "gradient-gold", label: "Pack Partenaire" },
};

const statusConfig: Record<string, { bg: string; label: string }> = {
  pending: { bg: "bg-warning/10 text-warning", label: "En attente" },
  validated: { bg: "bg-accent/10 text-accent", label: "Validé" },
  failed: { bg: "bg-destructive/10 text-destructive", label: "Échoué" },
};

const Historique = () => {
  const { user } = useAuth();
  const [filter, setFilter] = useState<typeof filters[number]>("Tout");

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions", user?.id, filter],
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (filter === "Achat numéro") query = query.in("type", ["number_purchase", "partner_activation"]);
      else if (filter === "Parrainage") query = query.eq("type", "referral_bonus");
      else if (filter === "Retrait") query = query.eq("type", "withdrawal");

      const { data } = await query;
      return data ?? [];
    },
    enabled: !!user,
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg px-4 pt-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Historique</h1>
          <p className="text-sm text-muted-foreground">Toutes vos transactions</p>
        </motion.div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                filter === f
                  ? "gradient-primary text-primary-foreground shadow-card"
                  : "bg-card text-muted-foreground shadow-sm"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          {isLoading && (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />
              ))}
            </div>
          )}

          {!isLoading && transactions?.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 rounded-2xl bg-card p-10 shadow-card"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="font-medium text-muted-foreground">Aucune transaction</p>
              <p className="text-sm text-muted-foreground/70">Vos transactions apparaîtront ici</p>
            </motion.div>
          )}

          <AnimatePresence>
            {transactions?.map((tx, index) => {
              const config = typeConfig[tx.type] ?? typeConfig.deposit;
              const status = statusConfig[tx.status] ?? statusConfig.pending;
              const Icon = config.icon;
              const isPositive = tx.type !== "withdrawal";
              const numberInfo = (tx as any).virtual_number;

              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card"
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${config.color}`}>
                    <Icon className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{config.label}</p>
                    {numberInfo ? (
                      <p className="text-xs font-mono text-accent truncate">{numberInfo}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), "d MMM yyyy, HH:mm", { locale: fr })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold ${isPositive ? "text-accent" : "text-destructive"}`}>
                      {isPositive ? "+" : "-"}{(tx.amount_fcfa ?? tx.amount_pi ?? 0).toLocaleString("fr-FR")} {tx.amount_fcfa ? "FCFA" : "π"}
                    </p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.bg}`}>
                      {status.label}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Historique;
