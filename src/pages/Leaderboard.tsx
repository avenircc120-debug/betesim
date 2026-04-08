import { Trophy, Users, Zap, Medal } from "lucide-react";
import { motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { getLevelInfo } from "@/lib/levels";

const tabs = ["Top Mineurs", "Top Parrains"] as const;

const Leaderboard = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<typeof tabs[number]>("Top Mineurs");

  const { data: topMiners } = useQuery({
    queryKey: ["leaderboard-miners"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, pi_balance")
        .order("pi_balance", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const { data: topReferrers } = useQuery({
    queryKey: ["leaderboard-referrers"],
    queryFn: async () => {
      // Get referral counts per referrer
      const { data } = await supabase
        .from("referrals")
        .select("referrer_id")
        .eq("activated", true);

      if (!data) return [];

      const counts: Record<string, number> = {};
      data.forEach((r) => {
        counts[r.referrer_id] = (counts[r.referrer_id] || 0) + 1;
      });

      const sorted = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20);

      if (sorted.length === 0) return [];

      const ids = sorted.map(([id]) => id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", ids);

      return sorted.map(([id, count]) => ({
        id,
        username: profiles?.find((p) => p.id === id)?.username ?? "Utilisateur",
        count,
      }));
    },
  });

  const getMedalColor = (index: number) => {
    if (index === 0) return "text-gold";
    if (index === 1) return "text-muted-foreground";
    if (index === 2) return "text-warning";
    return "text-muted-foreground/50";
  };

  const getMedalBg = (index: number) => {
    if (index === 0) return "gradient-gold";
    if (index === 1) return "bg-muted";
    if (index === 2) return "bg-warning/20";
    return "bg-muted/50";
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg px-4 pt-5 space-y-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Classement</h1>
          <p className="text-sm text-muted-foreground">Les meilleurs de PI REAL</p>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                tab === t
                  ? "gradient-primary text-primary-foreground shadow-card"
                  : "bg-card text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-2">
          {tab === "Top Mineurs"
            ? topMiners?.map((miner, idx) => {
                const level = getLevelInfo(miner.pi_balance);
                return (
                  <motion.div
                    key={miner.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card ${miner.id === user?.id ? "ring-2 ring-primary/30" : ""}`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${getMedalBg(idx)}`}>
                      {idx < 3 ? (
                        <Medal className={`h-5 w-5 ${idx === 0 ? "text-gold-foreground" : getMedalColor(idx)}`} />
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">{idx + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">{miner.username ?? "Utilisateur"}</p>
                        <span className="text-xs">{level.emoji}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{level.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{miner.pi_balance.toLocaleString("fr-FR")} π</p>
                    </div>
                  </motion.div>
                );
              })
            : topReferrers?.map((ref, idx) => (
                <motion.div
                  key={ref.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={`flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card ${ref.id === user?.id ? "ring-2 ring-primary/30" : ""}`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${getMedalBg(idx)}`}>
                    {idx < 3 ? (
                      <Medal className={`h-5 w-5 ${idx === 0 ? "text-gold-foreground" : getMedalColor(idx)}`} />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">{idx + 1}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{ref.username}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-accent" />
                    <p className="font-bold text-accent">{ref.count}</p>
                  </div>
                </motion.div>
              ))}

          {((tab === "Top Mineurs" && (!topMiners || topMiners.length === 0)) ||
            (tab === "Top Parrains" && (!topReferrers || topReferrers.length === 0))) && (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-10 shadow-card">
              <Trophy className="h-12 w-12 text-muted-foreground/30" />
              <p className="text-muted-foreground">Aucun classement disponible</p>
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Leaderboard;
