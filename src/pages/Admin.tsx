import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Shield, Save, Loader2, Search, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface PartnerPackRow {
  id: string;
  user_id: string;
  status: string;
  partner_id: string | null;
  telegram_number: string | null;
  amount_fcfa: number;
  fedapay_transaction_id: string | null;
  created_at: string;
  delivered_at: string | null;
  profiles?: { email?: string | null; username?: string | null; phone_number?: string | null } | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  paid: { label: "Payé", cls: "bg-warning/10 text-warning" },
  partner_id_provided: { label: "ID saisi", cls: "bg-primary/10 text-primary" },
  delivered: { label: "Livré", cls: "bg-accent/10 text-accent" },
};

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [linkInput, setLinkInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/login?redirect=/admin");
  }, [authLoading, user, navigate]);

  // Vérifie l'accès admin
  const { data: adminCheck, isLoading: checkingAdmin } = useQuery({
    queryKey: ["admin-check", user?.id],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("partner-pack", {
        body: { action: "admin-check", user_id: user!.id, email: user!.email },
      });
      return data?.is_admin === true;
    },
    enabled: !!user,
  });

  // Lien partenaire courant
  const { data: currentLink } = useQuery({
    queryKey: ["partner-link"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("partner-pack", {
        body: { action: "settings-get" },
      });
      return (data?.partner_link as string) ?? "";
    },
    enabled: !!adminCheck,
  });

  useEffect(() => {
    if (currentLink !== undefined && !linkInput) setLinkInput(currentLink ?? "");
  }, [currentLink]); // eslint-disable-line react-hooks/exhaustive-deps

  // Liste des packs
  const { data: list, isLoading: loadingList, refetch } = useQuery({
    queryKey: ["admin-partner-packs", search],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("partner-pack", {
        body: { action: "admin-list", user_id: user!.id, email: user!.email, limit: 200, search: search.trim() || undefined },
      });
      if (!data?.success) throw new Error(data?.error || "Erreur");
      return { packs: data.packs as PartnerPackRow[], total: data.total as number };
    },
    enabled: !!adminCheck,
  });

  const saveLinkMutation = useMutation({
    mutationFn: async (newLink: string) => {
      const { data } = await supabase.functions.invoke("partner-pack", {
        body: { action: "admin-set-link", user_id: user!.id, email: user!.email, partner_link: newLink },
      });
      if (!data?.success) throw new Error(data?.error || "Erreur");
      return data;
    },
    onSuccess: () => {
      toast.success("Lien partenaire mis à jour");
      queryClient.invalidateQueries({ queryKey: ["partner-link"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (authLoading || checkingAdmin) {
    return (
      <div className="min-h-screen bg-background pb-24 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!adminCheck) {
    return (
      <div className="min-h-screen bg-background pb-24 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <Shield className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Accès refusé</h2>
          <p className="text-sm text-muted-foreground">Cette page est réservée à l'administrateur.</p>
          <Button onClick={() => navigate("/")} variant="outline">Retour à l'accueil</Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-3xl space-y-5 px-4 pt-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Administration</h1>
            <p className="text-sm text-muted-foreground">Gestion des Packs Partenaire</p>
          </div>
        </motion.div>

        {/* Lien Partenaire */}
        <div className="rounded-2xl bg-card p-5 shadow-card space-y-3">
          <div>
            <h2 className="font-bold text-foreground">Lien Partenaire (LINK_PARTENAIRE)</h2>
            <p className="text-xs text-muted-foreground">URL ouverte par les clients à l'étape 2 du Pack Partenaire.</p>
          </div>
          <div className="flex gap-2">
            <Input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="https://1win-partners.com/?p=..."
              className="h-11 rounded-xl text-sm"
            />
            <Button
              onClick={() => saveLinkMutation.mutate(linkInput.trim())}
              disabled={saveLinkMutation.isPending || linkInput.trim() === (currentLink ?? "")}
              className="h-11 rounded-xl gradient-primary text-primary-foreground font-semibold px-5"
            >
              {saveLinkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </div>
          {currentLink && (
            <a href={currentLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Tester le lien actuel
            </a>
          )}
        </div>

        {/* Liste des packs */}
        <div className="rounded-2xl bg-card p-5 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-foreground">Clients Pack Partenaire</h2>
              <p className="text-xs text-muted-foreground">{list?.total ?? 0} pack(s) enregistré(s)</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-xl">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Rafraîchir
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par ID Partenaire ou numéro Telegram…"
              className="pl-9 h-10 rounded-xl text-sm"
            />
          </div>

          {loadingList && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />)}
            </div>
          )}

          {!loadingList && list?.packs?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Aucun client pour le moment.</p>
          )}

          <div className="space-y-2">
            {list?.packs?.map((p) => {
              const status = STATUS_LABEL[p.status] ?? { label: p.status, cls: "bg-muted text-muted-foreground" };
              const who = p.profiles?.username || p.profiles?.email || p.user_id.slice(0, 8);
              return (
                <div key={p.id} className="rounded-xl border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{who}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.profiles?.email ?? "—"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>ID: <span className="font-mono text-foreground">{p.partner_id ?? "—"}</span></span>
                        <span>Tél: <span className="font-mono text-foreground">{p.telegram_number ?? "—"}</span></span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Créé le {format(new Date(p.created_at), "d MMM yyyy HH:mm", { locale: fr })}
                        {p.delivered_at && ` · Livré le ${format(new Date(p.delivered_at), "d MMM HH:mm", { locale: fr })}`}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Admin;
