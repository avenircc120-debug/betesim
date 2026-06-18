import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PlusCircle, Tag, Wallet, TrendingUp, ArrowDownCircle,
  CheckCircle, XCircle, Clock, Loader2, RefreshCw, Store,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

interface Coupon {
  id: string; code: string; label: string | null; price_fcfa: number;
  sold_count: number; status: string; created_at: string;
  analyses?: { title: string; team_home: string; team_away: string } | null;
}
interface CommissionRecord {
  id: string; type: string; gross_amount: number;
  net_amount: number; description: string | null; created_at: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active:  { label: "En vente",  color: "text-green-400",  icon: <CheckCircle className="w-3.5 h-3.5" /> },
  sold:    { label: "Vendu",     color: "text-blue-400",   icon: <CheckCircle className="w-3.5 h-3.5" /> },
  paused:  { label: "Pausé",     color: "text-yellow-400", icon: <Clock       className="w-3.5 h-3.5" /> },
  expired: { label: "Expiré",    color: "text-red-400",    icon: <XCircle     className="w-3.5 h-3.5" /> },
};

export default function RevendeurDashboard() {
  const { user, requireAuth } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  const [showInject, setShowInject] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [form, setForm] = useState({ label: "", price_fcfa: "500", code: "", analysis_id: "" });
  const [wForm, setWForm] = useState({ amount: "", phone: "", provider: "mtn" });

  // Mes coupons injectés
  const { data: coupons = [], isLoading: loadingCoupons, refetch } = useQuery<Coupon[]>({
    queryKey: ["my-pool-coupons", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("*, analyses(title,team_home,team_away)")
        .eq("creator_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
  });

  // Mes commissions
  const { data: commissions = [] } = useQuery<CommissionRecord[]>({
    queryKey: ["my-commissions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_records")
        .select("id,type,gross_amount,net_amount,description,created_at")
        .eq("partner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as CommissionRecord[];
    },
  });

  // Solde vendeur
  const { data: wallet } = useQuery({
    queryKey: ["seller-wallet", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("seller_wallet_balances")
        .select("*")
        .eq("partner_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  // Injection dans le Pool Commun
  const injectMutation = useMutation({
    mutationFn: async () => {
      const price = parseInt(form.price_fcfa);
      if (isNaN(price) || price < 100) throw new Error("Prix minimum : 100 FCFA");
      const body: Record<string, unknown> = { price_fcfa: price };
      if (form.label.trim())       body.label       = form.label.trim();
      if (form.code.trim())        body.code        = form.code.trim().toUpperCase();
      if (form.analysis_id.trim()) body.analysis_id = form.analysis_id.trim();
      const { data, error } = await supabase.functions.invoke("inject-to-pool", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Coupon ${d.code} injecté dans le Pool ! 🎉`);
      setShowInject(false);
      setForm({ label: "", price_fcfa: "500", code: "", analysis_id: "" });
      qc.invalidateQueries({ queryKey: ["my-pool-coupons"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Demande de retrait
  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const amount = parseInt(wForm.amount);
      if (isNaN(amount) || amount < 500) throw new Error("Montant minimum : 500 FCFA");
      const { error } = await supabase.from("seller_withdrawal_requests").insert({
        partner_id: user!.id, amount_fcfa: amount,
        phone_number: wForm.phone.trim(), provider: wForm.provider,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Demande de retrait envoyée ✅");
      setShowWithdraw(false);
      setWForm({ amount: "", phone: "", provider: "mtn" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!profile?.is_partner) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <Store className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Accès réservé aux revendeurs partenaires.</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  const totalEarned  = wallet?.total_earned_fcfa  ?? 0;
  const totalSales   = wallet?.total_sales         ?? 0;
  const activeCoupons = coupons.filter(c => c.status === "active").length;
  const soldCoupons   = coupons.filter(c => c.status === "sold").length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-4 pt-6 space-y-6 max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Dashboard Revendeur</h1>
            <p className="text-xs text-muted-foreground">Pool Commun — gestion de vos coupons</p>
          </div>
          <button onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["seller-wallet"] }); }}
            className="p-2 rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: <Wallet className="w-4 h-4" />, label: "Gains nets", value: `${totalEarned.toLocaleString()} FCFA`, color: "text-green-400" },
            { icon: <TrendingUp className="w-4 h-4" />, label: "Ventes totales", value: String(totalSales), color: "text-blue-400" },
            { icon: <Tag className="w-4 h-4" />, label: "Coupons actifs", value: String(activeCoupons), color: "text-yellow-400" },
            { icon: <CheckCircle className="w-4 h-4" />, label: "Coupons vendus", value: String(soldCoupons), color: "text-purple-400" },
          ].map((s) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-xl p-4 space-y-1">
              <div className={`flex items-center gap-1.5 text-xs text-muted-foreground`}>
                <span className={s.color}>{s.icon}</span>{s.label}
              </div>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={() => requireAuth(() => setShowInject(true))} className="flex-1 gap-2">
            <PlusCircle className="w-4 h-4" /> Injecter un coupon
          </Button>
          <Button variant="outline" onClick={() => requireAuth(() => setShowWithdraw(true))} className="flex-1 gap-2">
            <ArrowDownCircle className="w-4 h-4" /> Retirer
          </Button>
        </div>

        {/* Commission Rule */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 text-xs text-blue-300 space-y-0.5">
          <p className="font-semibold">Répartition par vente</p>
          <p>🟢 Vous (créateur) : <strong>70%</strong> — 🟡 Parrain de l'acheteur : <strong>10%</strong> — 🔴 Plateforme : <strong>20%</strong></p>
        </div>

        {/* Mes coupons */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Mes coupons injectés</h2>
          {loadingCoupons ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : coupons.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Aucun coupon injecté pour l'instant.</div>
          ) : (
            coupons.map((c) => {
              const s = STATUS_LABEL[c.status] ?? STATUS_LABEL.active;
              return (
                <div key={c.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono font-bold text-sm text-foreground">{c.code}</p>
                      {c.label && <p className="text-xs text-muted-foreground">{c.label}</p>}
                      {c.analyses && <p className="text-xs text-muted-foreground mt-0.5">{c.analyses.team_home} vs {c.analyses.team_away}</p>}
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-medium ${s.color}`}>
                      {s.icon}{s.label}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Prix : <strong className="text-foreground">{c.price_fcfa.toLocaleString()} FCFA</strong></span>
                    <span>{new Date(c.created_at).toLocaleDateString("fr-FR")}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Historique commissions */}
        {commissions.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Historique commissions</h2>
            {commissions.map((c) => (
              <div key={c.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{c.description ?? c.type}</p>
                  <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("fr-FR")}</p>
                </div>
                <p className="text-sm font-bold text-green-400">+{c.net_amount.toLocaleString()} FCFA</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Injecter coupon */}
      <Dialog open={showInject} onOpenChange={setShowInject}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Injecter dans le Pool Commun</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Libellé (optionnel)</label>
              <Input placeholder="ex: Combo 3 matchs ligue 1" value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prix (FCFA)</label>
              <Input type="number" min={100} placeholder="500" value={form.price_fcfa}
                onChange={e => setForm(f => ({ ...f, price_fcfa: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Code personnalisé (optionnel)</label>
              <Input placeholder="Laissez vide pour auto-générer" value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="font-mono uppercase" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ID analyse liée (optionnel)</label>
              <Input placeholder="UUID de l'analyse" value={form.analysis_id}
                onChange={e => setForm(f => ({ ...f, analysis_id: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={() => injectMutation.mutate()} disabled={injectMutation.isPending}>
              {injectMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Injection…</> : "Injecter dans le Pool"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Retrait */}
      <Dialog open={showWithdraw} onOpenChange={setShowWithdraw}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Demande de retrait</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Montant (FCFA, min 500)</label>
              <Input type="number" min={500} placeholder="500" value={wForm.amount}
                onChange={e => setWForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Numéro Mobile Money</label>
              <Input placeholder="+229 XX XX XX XX" value={wForm.phone}
                onChange={e => setWForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Opérateur</label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={wForm.provider} onChange={e => setWForm(f => ({ ...f, provider: e.target.value }))}>
                <option value="mtn">MTN Mobile Money</option>
                <option value="moov">Moov Money</option>
                <option value="orange">Orange Money</option>
              </select>
            </div>
            <Button className="w-full" onClick={() => withdrawMutation.mutate()} disabled={withdrawMutation.isPending}>
              {withdrawMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Envoi…</> : "Envoyer la demande"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
