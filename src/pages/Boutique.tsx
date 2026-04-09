
import { ShoppingBag, Phone, Users, ArrowLeft, CreditCard, Check, MessageCircle, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { createFedaPayTransaction } from "@/lib/fedapay";

type Step = "select" | "confirm";
type Product = "simple" | "partner";
type Service = "whatsapp" | "tiktok";

const PRODUCTS = {
  simple: {
    id: "simple" as Product,
    name: "Numéro Simple",
    price: 2000,
    description: "1 numéro virtuel pour WhatsApp ou TikTok",
    features: [
      "1 numéro virtuel actif",
      "Livraison instantanée",
      "Valable selon disponibilité opérateur",
    ],
    gradientClass: "from-blue-500 to-blue-700",
    includesPartner: false,
  },
  partner: {
    id: "partner" as Product,
    name: "Pack Partenaire",
    price: 2500,
    description: "1 numéro virtuel + système de parrainage activé",
    features: [
      "1 numéro virtuel inclus",
      "Livraison instantanée",
      "Lien de parrainage débloqué",
      "Commissions sur vos filleuls",
      "Statut Partenaire officiel",
    ],
    gradientClass: "from-amber-500 to-orange-600",
    includesPartner: true,
  },
};

const SERVICES: { id: Service; name: string; color: string }[] = [
  { id: "whatsapp", name: "WhatsApp", color: "bg-green-500" },
  { id: "tiktok", name: "TikTok", color: "bg-black" },
];

const Boutique = () => {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("select");
  const [selectedProduct, setSelectedProduct] = useState<Product>("simple");
  const [selectedService, setSelectedService] = useState<Service>("whatsapp");
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get("id");
    const status = params.get("status");
    if (!transactionId || !status) return;
    window.history.replaceState({}, "", window.location.pathname);
    const savedProduct = (sessionStorage.getItem("pending_product") as Product) || "simple";
    const savedService = (sessionStorage.getItem("pending_service") as Service) || "whatsapp";
    sessionStorage.removeItem("pending_product");
    sessionStorage.removeItem("pending_service");
    if (status === "approved") {
      (async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deliver-number`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: anonKey,
                Authorization: `Bearer ${sessionData.session?.access_token}`,
              },
              body: JSON.stringify({
                service: savedService,
                product_type: savedProduct,
                fedapay_transaction_id: transactionId,
              }),
            }
          );
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Erreur livraison numéro");
          toast.success(
            `Votre numéro ${savedService === "whatsapp" ? "WhatsApp" : "TikTok"} a été livré ! Consultez votre historique.`
          );
          queryClient.invalidateQueries({ queryKey: ["profile"] });
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        } catch (e: any) {
          toast.error(e.message || "Erreur livraison. Contactez le support.");
        }
      })();
    } else {
      toast.error("Paiement annulé ou refusé. Veuillez réessayer.");
    }
  }, [user]);

  const handlePay = useCallback(async () => {
    setIsPaying(true);
    try {
      if (!user) throw new Error("Non connecté");
      const product = PRODUCTS[selectedProduct];
      sessionStorage.setItem("pending_product", selectedProduct);
      sessionStorage.setItem("pending_service", selectedService);
      const result = await createFedaPayTransaction({
        amount: product.price,
        description: `${product.name} — Numéro ${selectedService === "whatsapp" ? "WhatsApp" : "TikTok"}`,
        userId: user.id,
        paymentType: "number_purchase",
        callbackUrl: `${window.location.origin}/boutique`,
      });
      window.location.href = result.paymentUrl;
    } catch (e: any) {
      setIsPaying(false);
      sessionStorage.removeItem("pending_product");
      sessionStorage.removeItem("pending_service");
      toast.error(e.message || "Erreur paiement. Réessayez.");
    }
  }, [user, selectedProduct, selectedService]);

  const product = PRODUCTS[selectedProduct];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-6 px-4 pt-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Boutique</h1>
          <p className="text-sm text-muted-foreground">
            Numéros virtuels pour WhatsApp et TikTok
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {step === "select" ? (
            <motion.div
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Choisissez votre offre
                </h2>
                {Object.values(PRODUCTS).map((p) => (
                  <motion.button
                    key={p.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedProduct(p.id)}
                    className={`w-full text-left rounded-2xl border-2 p-5 transition-all shadow-card ${
                      selectedProduct === p.id
                        ? "border-primary bg-primary/5"
                        : "border-transparent bg-card"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${p.gradientClass}`}
                      >
                        <ShoppingBag className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-foreground">{p.name}</p>
                          {p.includesPartner && (
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                              RECOMMANDÉ
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                        <ul className="mt-2 space-y-1">
                          {p.features.map((f) => (
                            <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Check className="h-3 w-3 text-accent shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-bold text-foreground">
                          {p.price.toLocaleString("fr-FR")}
                        </p>
                        <p className="text-xs text-muted-foreground">FCFA</p>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Choisissez le service
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {SERVICES.map((s) => (
                    <motion.button
                      key={s.id}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelectedService(s.id)}
                      className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${
                        selectedService === s.id
                          ? "border-primary bg-primary/5"
                          : "border-transparent bg-card shadow-card"
                      }`}
                    >
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl ${s.color}`}
                      >
                        {s.id === "whatsapp" ? (
                          <MessageCircle className="h-6 w-6 text-white" />
                        ) : (
                          <Video className="h-6 w-6 text-white" />
                        )}
                      </div>
                      <p className="font-semibold text-foreground text-sm">{s.name}</p>
                    </motion.button>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => setStep("confirm")}
                className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-semibold text-base shadow-glow"
              >
                Continuer — {PRODUCTS[selectedProduct].price.toLocaleString("fr-FR")} FCFA
              </Button>

              <div className="space-y-2 pt-1">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Comment ça marche
                </h3>
                {[
                  {
                    icon: ShoppingBag,
                    title: "1. Choisissez votre offre",
                    desc: "Numéro simple (2 000 F) ou Pack Partenaire (2 500 F)",
                    color: "gradient-primary",
                  },
                  {
                    icon: CreditCard,
                    title: "2. Payez en ligne",
                    desc: "Paiement sécurisé via FedaPay (Mobile Money, carte…)",
                    color: "gradient-accent",
                  },
                  {
                    icon: Phone,
                    title: "3. Numéro livré instantanément",
                    desc: "Votre numéro virtuel est disponible dans votre historique",
                    color: "gradient-gold",
                  },
                  {
                    icon: Users,
                    title: "4. Pack Partenaire = commissions",
                    desc: "Parrainez vos amis et gagnez sur chacun de leurs achats",
                    color: "gradient-gold",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.color}`}
                    >
                      <item.icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <button
                type="button"
                onClick={() => setStep("select")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Modifier ma sélection
              </button>

              <div
                className={`rounded-2xl p-5 shadow-card bg-gradient-to-br ${product.gradientClass} text-white`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow">
                    <ShoppingBag className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
                      Récapitulatif
                    </p>
                    <p className="text-xl font-bold">{product.name}</p>
                    <p className="text-sm opacity-80">
                      Numéro {selectedService === "whatsapp" ? "WhatsApp" : "TikTok"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{product.price.toLocaleString("fr-FR")}</p>
                    <p className="text-xs opacity-80">FCFA</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-card p-5 shadow-card space-y-3">
                <p className="font-semibold text-foreground text-sm">Ce qui est inclus :</p>
                <ul className="space-y-2">
                  {product.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-accent shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {product.includesPartner && (
                  <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                    <p className="text-xs text-amber-600 font-semibold">
                      En choisissant le Pack Partenaire, vous débloquez votre lien de parrainage
                      et gagnez des commissions sur chaque achat de vos filleuls.
                    </p>
                  </div>
                )}
              </div>

              <Button
                onClick={handlePay}
                disabled={isPaying}
                className="h-14 w-full rounded-xl gradient-primary text-primary-foreground font-bold text-base shadow-glow disabled:opacity-40"
              >
                {isPaying ? (
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                    <span>Redirection vers FedaPay…</span>
                  </div>
                ) : (
                  <>
                    <CreditCard className="h-5 w-5 mr-2" />
                    Payer {product.price.toLocaleString("fr-FR")} FCFA
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Paiement 100% sécurisé via FedaPay
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
};

export default Boutique;
