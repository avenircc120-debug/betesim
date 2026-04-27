import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Check, Copy, ExternalLink, Loader2, MessageCircle, ShieldCheck, AlertTriangle, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BottomNav from "@/components/BottomNav";
import ShareButtons from "@/components/ShareButtons";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

type PackStatus = "paid" | "partner_id_provided" | "delivered";

interface PartnerPack {
  id: string;
  user_id: string;
  status: PackStatus;
  partner_id: string | null;
  telegram_number: string | null;
  subscription_id: string | null;
  fedapay_transaction_id: string | null;
  created_at: string;
}

const PackPartenaire = () => {
  const { user, requireAuth, loading: authLoading } = useAuth();
  const { data: profile } = useProfile();
  const [searchParams] = useSearchParams();
  const packId = searchParams.get("id");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [partnerIdInput, setPartnerIdInput] = useState("");
  const [submittingId, setSubmittingId] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [linkOpened, setLinkOpened] = useState(false);

  // Auth garde
  useEffect(() => {
    if (!authLoading && !user) requireAuth(() => {});
  }, [authLoading, user, requireAuth]);

  // Lien partenaire (admin-éditable)
  const { data: partnerLink } = useQuery({
    queryKey: ["partner-link"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("partner-pack", {
        body: { action: "settings-get" },
      });
      return (data?.partner_link as string) ?? "";
    },
    staleTime: 60_000,
  });

  // Pack
  const { data: pack, isLoading: loadingPack, refetch } = useQuery<PartnerPack | null>({
    queryKey: ["partner-pack", packId, user?.id],
    queryFn: async () => {
      if (!packId || !user) return null;
      const { data, error } = await supabase
        .from("partner_packs" as any)
        .select("*")
        .eq("id", packId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      if ((data as any).user_id !== user.id) throw new Error("Accès refusé");
      return data as any;
    },
    enabled: !!packId && !!user,
    refetchInterval: (q) => {
      const d = q.state.data as PartnerPack | null;
      return d && d.status !== "delivered" ? 8000 : false;
    },
  });

  // Pré-remplit l'input si déjà saisi
  useEffect(() => {
    if (pack?.partner_id && !partnerIdInput) setPartnerIdInput(pack.partner_id);
  }, [pack?.partner_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // SMS code (depuis subscriptions, mis à jour par le hook send-sms-hook)
  const { data: subscription } = useQuery({
    queryKey: ["subscription", pack?.subscription_id],
    queryFn: async () => {
      if (!pack?.subscription_id) return null;
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("id", pack.subscription_id)
        .maybeSingle();
      return data;
    },
    enabled: !!pack?.subscription_id && pack?.status === "delivered",
    refetchInterval: 10_000,
  });

  const currentStep: 2 | 3 | 4 = useMemo(() => {
    if (!pack) return 2;
    if (pack.status === "delivered") return 4;
    if (pack.status === "partner_id_provided") return 4;
    return 2;
  }, [pack]);

  // Étape 3 : valider l'ID
  const submitPartnerId = async () => {
    if (!user || !pack) return;
    if (partnerIdInput.trim().length < 3) {
      toast.error("Saisissez votre ID Partenaire (3 caractères minimum)");
      return;
    }
    setSubmittingId(true);
    try {
      const { data, error } = await supabase.functions.invoke("partner-pack", {
        body: { action: "submit-id", user_id: user.id, pack_id: pack.id, partner_id: partnerIdInput.trim() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erreur");
      toast.success("ID Partenaire enregistré");
      await refetch();
      // Lance la livraison automatiquement
      deliverNumber();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'enregistrement");
    } finally {
      setSubmittingId(false);
    }
  };

  // Étape 4 : livrer le numéro
  const deliverNumber = async () => {
    if (!user || !pack) return;
    setDelivering(true);
    try {
      const { data, error } = await supabase.functions.invoke("partner-pack", {
        body: { action: "deliver", user_id: user.id, pack_id: pack.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Livraison impossible");
      toast.success("Numéro Telegram livré !");
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["subscription", pack.id] });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la livraison");
    } finally {
      setDelivering(false);
    }
  };

  const openPartnerLink = () => {
    if (!partnerLink) {
      toast.error("Le lien partenaire n'est pas encore configuré. Réessayez dans quelques instants.");
      return;
    }
    window.open(partnerLink, "_blank", "noopener,noreferrer");
    setLinkOpened(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copié`));
  };

  if (!packId) {
    return (
      <div className="min-h-screen bg-background pb-24 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-warning mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Pack introuvable</h2>
          <p className="text-sm text-muted-foreground">L'identifiant du pack est manquant. Retournez à la boutique pour réessayer.</p>
          <Button onClick={() => navigate("/boutique")} className="rounded-xl gradient-primary">
            Retour à la boutique
          </Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (loadingPack || !pack) {
    return (
      <div className="min-h-screen bg-background pb-24 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Pack Partenaire</h1>
          <p className="text-sm text-muted-foreground">Procédure d'activation en 4 étapes</p>
        </motion.div>

        {/* Stepper */}
        <div className="flex items-center justify-between rounded-2xl bg-card p-3 shadow-card">
          {[
            { n: 1, label: "Paiement" },
            { n: 2, label: "Compte" },
            { n: 3, label: "ID" },
            { n: 4, label: "Numéro" },
          ].map((s, i, arr) => {
            const done = s.n < currentStep || (s.n === 1) || (s.n === 2 && currentStep > 2 && linkOpened) || (s.n === 3 && !!pack.partner_id) || (s.n === 4 && pack.status === "delivered");
            const active = s.n === currentStep;
            return (
              <div key={s.n} className="flex-1 flex items-center">
                <div className="flex flex-col items-center flex-1">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    done ? "bg-accent text-accent-foreground" : active ? "gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {done ? <Check className="h-4 w-4" /> : s.n}
                  </div>
                  <p className={`mt-1 text-[10px] font-medium text-center ${active ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</p>
                </div>
                {i < arr.length - 1 && <div className={`h-0.5 flex-1 ${done ? "bg-accent" : "bg-muted"}`} />}
              </div>
            );
          })}
        </div>

        {/* Étape 1 : Paiement validé */}
        <div className="rounded-2xl bg-accent/10 border border-accent/30 p-4 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-accent shrink-0" />
          <div>
            <p className="font-semibold text-sm text-foreground">Paiement confirmé · 2 500 FCFA</p>
            <p className="text-xs text-muted-foreground">Pack Partenaire activé</p>
          </div>
        </div>

        {/* Étape 2 : Créer le compte Partenaire */}
        {currentStep <= 3 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-card p-5 shadow-card space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full gradient-primary text-[11px] font-bold text-primary-foreground">2</span>
              <h2 className="font-bold text-foreground">Créer mon compte Partenaire</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Cliquez sur le bouton ci-dessous pour ouvrir la page d'inscription Partenaire dans un nouvel onglet, créez votre compte, puis revenez ici avec votre ID Partenaire.
            </p>
            <Button
              onClick={openPartnerLink}
              disabled={!partnerLink}
              className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              {linkOpened ? "Rouvrir la page Partenaire" : "Créer mon compte Partenaire"}
            </Button>
            {!partnerLink && (
              <p className="text-xs text-warning text-center">Lien partenaire en cours de configuration. Réessayez dans un instant.</p>
            )}
          </motion.div>
        )}

        {/* Étape 3 : Saisir l'ID Partenaire */}
        {currentStep === 2 && linkOpened && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-card p-5 shadow-card space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full gradient-primary text-[11px] font-bold text-primary-foreground">3</span>
              <h2 className="font-bold text-foreground">Votre ID Partenaire</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Une fois votre compte créé, copiez votre ID Partenaire (ou code promo) et collez-le ici pour débloquer la livraison de votre numéro Telegram.
            </p>
            <Input
              value={partnerIdInput}
              onChange={(e) => setPartnerIdInput(e.target.value)}
              placeholder="Ex : 12345678 ou MONCODE"
              className="h-12 rounded-xl text-base"
              autoComplete="off"
            />
            <Button
              onClick={submitPartnerId}
              disabled={submittingId || partnerIdInput.trim().length < 3}
              className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow"
            >
              {submittingId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              Valider et recevoir mon numéro
            </Button>
          </motion.div>
        )}

        {/* Étape 4 : Livraison Telegram */}
        {currentStep === 4 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-card p-5 shadow-card space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full gradient-primary text-[11px] font-bold text-primary-foreground">4</span>
              <h2 className="font-bold text-foreground">Votre numéro Telegram</h2>
            </div>

            {pack.status !== "delivered" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Préparation de votre numéro en cours…</p>
                <Button
                  onClick={deliverNumber}
                  disabled={delivering}
                  className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow"
                >
                  {delivering ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                  {delivering ? "Allocation en cours…" : "Allouer mon numéro maintenant"}
                </Button>
              </div>
            )}

            {pack.status === "delivered" && pack.telegram_number && (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Numéro Telegram</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xl font-mono font-bold text-foreground">{pack.telegram_number}</p>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(pack.telegram_number!, "Numéro")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Code de connexion (SMS)</p>
                  {(subscription as any)?.last_sms_code ? (
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-xl font-mono font-bold text-accent tracking-widest">{(subscription as any).last_sms_code}</p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard((subscription as any).last_sms_code, "Code")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">En attente du SMS… (jusqu'à 3 min)</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3">
                  <p className="text-xs text-amber-700 leading-relaxed">
                    <strong>Important :</strong> entrez ce numéro dans Telegram comme votre numéro de téléphone, puis tapez le code de connexion reçu ci-dessus. Le numéro est valide 30 jours.
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={() => navigate("/historique")}
                  className="h-11 w-full rounded-xl"
                >
                  Voir mon historique
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* Bonus : lien de parrainage débloqué */}
        {pack.status === "delivered" && profile?.referral_code && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl bg-card p-5 shadow-card space-y-4 border border-gold/30"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold">
                <Users className="h-5 w-5 text-gold-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Votre lien de parrainage</h3>
                <p className="text-xs text-muted-foreground">Gagnez une commission sur chaque achat de vos filleuls</p>
              </div>
            </div>
            <ShareButtons
              referralLink={`${typeof window !== "undefined" ? window.location.origin : "https://betesim.vercel.app"}/auth?ref=${profile.referral_code}`}
            />
          </motion.div>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default PackPartenaire;
