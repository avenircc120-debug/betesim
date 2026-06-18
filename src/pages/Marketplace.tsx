import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Store, ShoppingCart, Tag, Search, Loader2, CheckCircle,
  X, Zap, Wallet, RefreshCw, TrendingUp, Star,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

interface PoolCoupon {
  id: string; code: string; label: string | null; price_fcfa: number;
  created_at: string; creator_id: string | null;
  analyses?: { title: string; team_home: string; team_away: string; league: string | null; confidence: string; odds: number | null } | null;
  profiles?: { display_name: string | null; username: string | null } | null;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  fort:   "bg-green-500/20 text-green-400 border-green-500/30",
  moyen:  "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  faible: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function Marketplace() {
  const { user, requireAuth } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PoolCoupon | null>(null);
  const [buying, setBuying] = useState(false);

  const { data: coupons = [], isLoading, refetch } = useQuery<PoolCoupon[]>({
    queryKey: ["pool-coupons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("id,code,label,price_fcfa,created_at,creator_id,analyses(title,team_home,team_away,league,confidence,odds),profiles!coupons_creator_id_fkey(display_name,username)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PoolCoupon[];
    },
  });

  const buyMutation = useMutation({
    mutationFn: async (coupon_id: string) => {
      const { data, error } = await supabase.functions.invoke("buy-coupon", { body: { coupon_id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Coupon ${d.coupon_code} acheté ! 🎉`);
      setBuying(false);
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["pool-coupons"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => { toast.error(e.message); setBuying(false); },
  });

  const filtered = coupons.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.code.toLowerCase().includes(q) ||
      c.label?.toLowerCase().includes(q) ||
      c.analyses?.team_home?.toLowerCase().includes(q) ||
      c.analyses?.team_away?.toLowerCase().includes(q) ||
      c.analyses?.league?.toLowerCase().includes(q)
    );
  });

  const handleBuy = (coupon: PoolCoupon) => {
    requireAuth(() => { setSelected(coupon); setBuying(false); });
  };

  const confirmBuy = () => {
    if (!selected) return;
    setBuying(true);
    buyMutation.mutate(selected.id);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 pt-6 space-y-5 max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Store className="w-5 h-5 text-primary" /> Pool Commun
            </h1>
            <p className="text-xs text-muted-foreground">Achetez des coupons de pronostics</p>
          </div>
          <button onClick={() => refetch()} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Solde */}
        {profile && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Wallet className="w-4 h-4 text-primary" />
              <span>Votre solde</span>
            </div>
            <span className="font-bold text-primary">{(profile as { fcfa_balance?: number }).fcfa_balance?.toLocaleString() ?? 0} FCFA</span>
          </div>
        )}

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher un coupon, match, ligue…" value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Stats rapides */}
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span className="bg-muted rounded-full px-3 py-1">{coupons.length} coupons disponibles</span>
          {search && <span className="bg-muted rounded-full px-3 py-1">{filtered.length} résultats</span>}
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Tag className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground text-sm">
              {search ? "Aucun coupon pour cette recherche." : "Le Pool Commun est vide pour l'instant."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filtered.map((c, i) => (
                <motion.div key={c.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.04 }}
                  className="bg-card border border-border rounded-xl p-4 space-y-3">

                  {/* Ligne 1 : code + prix */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-mono font-bold text-foreground">{c.code}</p>
                      {c.label && <p className="text-xs text-muted-foreground">{c.label}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">{c.price_fcfa.toLocaleString()} FCFA</p>
                      {c.profiles && (
                        <p className="text-xs text-muted-foreground">
                          par {c.profiles.username ?? c.profiles.display_name ?? "Revendeur"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Analyse liée */}
                  {c.analyses && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                      <p className="text-xs font-medium text-foreground">{c.analyses.team_home} vs {c.analyses.team_away}</p>
                      {c.analyses.league && <p className="text-xs text-muted-foreground">{c.analyses.league}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        {c.analyses.confidence && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CONFIDENCE_COLOR[c.analyses.confidence] ?? CONFIDENCE_COLOR.moyen}`}>
                            {c.analyses.confidence === "fort" ? "🔥 Fort" : c.analyses.confidence === "moyen" ? "⚡ Moyen" : "⚠️ Faible"}
                          </span>
                        )}
                        {c.analyses.odds && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
                            Cote {c.analyses.odds}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bouton achat */}
                  <Button size="sm" className="w-full gap-2" onClick={() => handleBuy(c)}
                    disabled={c.creator_id === user?.id}>
                    <ShoppingCart className="w-3.5 h-3.5" />
                    {c.creator_id === user?.id ? "Votre coupon" : "Acheter ce coupon"}
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Modal confirmation achat */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" /> Confirmer l'achat
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 mt-2">
              <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Coupon</span>
                  <span className="font-mono font-bold text-foreground">{selected.code}</span>
                </div>
                {selected.label && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Libellé</span>
                    <span className="text-foreground">{selected.label}</span>
                  </div>
                )}
                {selected.analyses && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Match</span>
                    <span className="text-foreground text-right">{selected.analyses.team_home} vs {selected.analyses.team_away}</span>
                  </div>
                )}
                <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
                  <span className="text-muted-foreground">Prix</span>
                  <span className="text-primary">{selected.price_fcfa.toLocaleString()} FCFA</span>
                </div>
                {profile && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Solde après achat</span>
                    <span className={(profile as { fcfa_balance?: number }).fcfa_balance! >= selected.price_fcfa ? "text-green-400" : "text-red-400"}>
                      {(((profile as { fcfa_balance?: number }).fcfa_balance ?? 0) - selected.price_fcfa).toLocaleString()} FCFA
                    </span>
                  </div>
                )}
              </div>

              {profile && (profile as { fcfa_balance?: number }).fcfa_balance! < selected.price_fcfa && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-400">
                  ⚠️ Solde insuffisant. Rechargez votre wallet avant d'acheter.
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSelected(null)}>
                  <X className="w-4 h-4 mr-1" /> Annuler
                </Button>
                <Button className="flex-1 gap-2" onClick={confirmBuy}
                  disabled={buying || !profile || (profile as { fcfa_balance?: number }).fcfa_balance! < selected.price_fcfa}>
                  {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {buying ? "Achat…" : "Confirmer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
