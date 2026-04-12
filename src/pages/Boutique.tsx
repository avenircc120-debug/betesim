
import { ShoppingBag, Phone, Users, ArrowLeft, CreditCard, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createFedaPayTransaction } from "@/lib/fedapay";

type Step = "select" | "confirm";
type Product = "simple" | "partner";

interface Service {
  id: string;
  name: string;
  emoji: string;
  color: string;
  category: string;
}

const ALL_SERVICES: Service[] = [
  { id: "whatsapp",    name: "WhatsApp",    emoji: "💬", color: "bg-green-500",   category: "Messagerie" },
  { id: "telegram",    name: "Telegram",    emoji: "✈️",  color: "bg-sky-500",     category: "Messagerie" },
  { id: "signal",      name: "Signal",      emoji: "🔒", color: "bg-blue-600",    category: "Messagerie" },
  { id: "viber",       name: "Viber",       emoji: "📳", color: "bg-violet-500",  category: "Messagerie" },
  { id: "line",        name: "Line",        emoji: "💚", color: "bg-green-600",   category: "Messagerie" },
  { id: "wechat",      name: "WeChat",      emoji: "🟢", color: "bg-green-400",   category: "Messagerie" },
  { id: "skype",       name: "Skype",       emoji: "☁️",  color: "bg-blue-500",    category: "Messagerie" },
  { id: "tiktok",      name: "TikTok",      emoji: "🎵", color: "bg-black",       category: "Réseaux sociaux" },
  { id: "instagram",   name: "Instagram",   emoji: "📸", color: "bg-pink-600",    category: "Réseaux sociaux" },
  { id: "facebook",    name: "Facebook",    emoji: "👤", color: "bg-blue-700",    category: "Réseaux sociaux" },
  { id: "twitter",     name: "Twitter / X", emoji: "🐦", color: "bg-sky-400",     category: "Réseaux sociaux" },
  { id: "snapchat",    name: "Snapchat",    emoji: "👻", color: "bg-yellow-400",  category: "Réseaux sociaux" },
  { id: "linkedin",    name: "LinkedIn",    emoji: "💼", color: "bg-blue-800",    category: "Réseaux sociaux" },
  { id: "pinterest",   name: "Pinterest",   emoji: "📌", color: "bg-red-500",     category: "Réseaux sociaux" },
  { id: "reddit",      name: "Reddit",      emoji: "🤖", color: "bg-orange-500",  category: "Réseaux sociaux" },
  { id: "discord",     name: "Discord",     emoji: "🎮", color: "bg-indigo-600",  category: "Gaming / Divertissement" },
  { id: "steam",       name: "Steam",       emoji: "🕹️", color: "bg-gray-800",    category: "Gaming / Divertissement" },
  { id: "twitch",      name: "Twitch",      emoji: "📺", color: "bg-purple-600",  category: "Gaming / Divertissement" },
  { id: "netflix",     name: "Netflix",     emoji: "🎬", color: "bg-red-600",     category: "Gaming / Divertissement" },
  { id: "spotify",     name: "Spotify",     emoji: "🎵", color: "bg-green-700",   category: "Gaming / Divertissement" },
  { id: "tinder",      name: "Tinder",      emoji: "❤️",  color: "bg-red-500",     category: "Rencontres" },
  { id: "bumble",      name: "Bumble",      emoji: "🐝", color: "bg-yellow-500",  category: "Rencontres" },
  { id: "google",      name: "Google",      emoji: "🔍", color: "bg-blue-500",    category: "Tech" },
  { id: "apple",       name: "Apple",       emoji: "🍎", color: "bg-gray-700",    category: "Tech" },
  { id: "amazon",      name: "Amazon",      emoji: "📦", color: "bg-orange-400",  category: "Tech" },
  { id: "paypal",      name: "PayPal",      emoji: "💳", color: "bg-blue-600",    category: "Tech" },
  { id: "airbnb",      name: "Airbnb",      emoji: "🏠", color: "bg-rose-500",    category: "Tech" },
  { id: "uber",        name: "Uber",        emoji: "🚗", color: "bg-black",       category: "Tech" },
  { id: "shein",       name: "Shein",       emoji: "👗", color: "bg-pink-500",    category: "Shopping" },
  { id: "aliexpress",  name: "AliExpress",  emoji: "🛒", color: "bg-red-600",     category: "Shopping" },
  { id: "ebay",        name: "eBay",        emoji: "🛍️", color: "bg-blue-700",    category: "Shopping" },
  { id: "shopee",      name: "Shopee",      emoji: "🟠", color: "bg-orange-500",  category: "Shopping" },
];

const CATEGORIES = ["Tous", "Messagerie", "Réseaux sociaux", "Gaming / Divertissement", "Rencontres", "Tech", "Shopping"];

const PRODUCTS = {
  simple: {
    id: "simple" as Product,
    name: "Numéro Simple",
    price: 2000,
    description: "1 numéro virtuel pour n'importe quel service",
    features: ["1 numéro virtuel actif", "Livraison instantanée", "Disponible pour +1000 services"],
    gradientClass: "from-blue-500 to-blue-700",
    includesPartner: false,
  },
  partner: {
    id: "partner" as Product,
    name: "Pack Partenaire",
    price: 2500,
    description: "1 numéro virtuel (n'importe quel service) + parrainage activé",
    features: [
      "1 numéro virtuel pour n'importe quel service",
      "Livraison instantanée après paiement",
      "Lien de parrainage personnel débloqué",
      "10% de commission sur chaque achat de vos filleuls",
      "Statut Partenaire officiel betesim",
    ],
    gradientClass: "from-amber-500 to-orange-600",
    includesPartner: true,
  },
};

const Boutique = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("select");
  const [selectedProduct, setSelectedProduct] = useState<Product>("simple");
  const [selectedService, setSelectedService] = useState<Service>(ALL_SERVICES[0]);
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [search, setSearch] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  const filteredServices = useMemo(() => {
    let list = ALL_SERVICES;
    if (activeCategory !== "Tous") list = list.filter((s) => s.category === activeCategory);
    if (search.trim()) list = list.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [activeCategory, search]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get("id");
    const status = params.get("status");
    if (!transactionId || !status) return;
    window.history.replaceState({}, "", window.location.pathname);
    const savedProduct = (sessionStorage.getItem("pending_product") as Product) || "simple";
    const savedServiceId = sessionStorage.getItem("pending_service") || "whatsapp";
    const savedServiceName = sessionStorage.getItem("pending_service_name") || savedServiceId;
    sessionStorage.removeItem("pending_product");
    sessionStorage.removeItem("pending_service");
    sessionStorage.removeItem("pending_service_name");

    if (status === "approved") {
      (async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deliver-number`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anonKey,
              Authorization: `Bearer ${sessionData.session?.access_token}`,
            },
            body: JSON.stringify({
              service: savedServiceId,
              product_type: savedProduct,
              fedapay_transaction_id: transactionId,
            }),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Erreur livraison numéro");
          toast.success(`Votre numéro ${savedServiceName} a été livré ! Consultez votre historique.`);
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
      sessionStorage.setItem("pending_service", selectedService.id);
      sessionStorage.setItem("pending_service_name", selectedService.name);
      const result = await createFedaPayTransaction({
        amount: product.price,
        description: `${product.name} — Numéro ${selectedService.name}`,
        userId: user.id,
        paymentType: "number_purchase",
        callbackUrl: `${window.location.origin}/boutique`,
      });
      window.location.href = result.paymentUrl;
    } catch (e: any) {
      setIsPaying(false);
      sessionStorage.removeItem("pending_product");
      sessionStorage.removeItem("pending_service");
      sessionStorage.removeItem("pending_service_name");
      toast.error(e.message || "Erreur paiement. Réessayez.");
    }
  }, [user, selectedProduct, selectedService]);

  const product = PRODUCTS[selectedProduct];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Boutique</h1>
          <p className="text-sm text-muted-foreground">+1 000 services disponibles via 5sim.net</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {step === "select" ? (
            <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">

              {/* OFFRES */}
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">1. Choisissez votre offre</h2>
                {Object.values(PRODUCTS).map((p) => (
                  <motion.button
                    key={p.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedProduct(p.id)}
                    className={`w-full text-left rounded-2xl border-2 p-4 transition-all shadow-card ${
                      selectedProduct === p.id ? "border-primary bg-primary/5" : "border-transparent bg-card"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${p.gradientClass}`}>
                        <ShoppingBag className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-foreground">{p.name}</p>
                          {p.includesPartner && (
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-600">RECOMMANDÉ</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-foreground">{p.price.toLocaleString("fr-FR")}</p>
                        <p className="text-xs text-muted-foreground">FCFA</p>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>

              {/* PARTNER BENEFITS BANNER */}
              {selectedProduct === "partner" && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-2 gap-3"
                >
                  <div className="rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-400/30 p-3 flex flex-col items-center gap-1.5 text-center">
                    <span className="text-2xl">📱</span>
                    <p className="text-xs font-bold text-amber-700">Numéro virtuel</p>
                    <p className="text-[10px] text-amber-600">Pour n'importe quel service</p>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-400/30 p-3 flex flex-col items-center gap-1.5 text-center">
                    <span className="text-2xl">🔗</span>
                    <p className="text-xs font-bold text-amber-700">Parrainage activé</p>
                    <p className="text-[10px] text-amber-600">10% de commission filleuls</p>
                  </div>
                </motion.div>
              )}

              {/* SERVICE SELECTOR */}
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  2. Choisissez le service{" "}
                  <span className="normal-case font-normal text-primary">— {selectedService.emoji} {selectedService.name} sélectionné</span>
                </h2>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un service…"
                    className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {/* Category tabs */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setSearch(""); }}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        activeCategory === cat
                          ? "gradient-primary text-primary-foreground shadow-sm"
                          : "bg-card text-muted-foreground shadow-sm"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Service grid */}
                <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
                  {filteredServices.map((s) => (
                    <motion.button
                      key={s.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedService(s)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-2.5 transition-all ${
                        selectedService.id === s.id
                          ? "border-primary bg-primary/5"
                          : "border-transparent bg-card shadow-sm"
                      }`}
                    >
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.color}`}>
                        <span className="text-lg">{s.emoji}</span>
                      </div>
                      <p className="text-[10px] font-medium text-foreground text-center leading-tight">{s.name}</p>
                    </motion.button>
                  ))}
                  {filteredServices.length === 0 && (
                    <div className="col-span-4 py-6 text-center text-sm text-muted-foreground">
                      Aucun service trouvé
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={() => setStep("confirm")}
                className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-semibold text-base shadow-glow"
              >
                Continuer — {PRODUCTS[selectedProduct].price.toLocaleString("fr-FR")} FCFA
              </Button>

              <div className="space-y-2 pt-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comment ça marche</h3>
                {[
                  { icon: ShoppingBag, title: "1. Choisissez votre offre & service", desc: "Simple (2 000 F) ou Pack Partenaire (2 500 F) · +1 000 services disponibles", color: "gradient-primary" },
                  { icon: CreditCard, title: "2. Payez en ligne", desc: "Paiement sécurisé via FedaPay (Mobile Money, carte…)", color: "gradient-accent" },
                  { icon: Phone, title: "3. Numéro livré instantanément", desc: "Votre numéro virtuel apparaît dans votre historique", color: "gradient-gold" },
                  { icon: Users, title: "4. Pack Partenaire = commissions", desc: "Parrainez vos amis et gagnez sur chacun de leurs achats", color: "gradient-gold" },
                ].map((item) => (
                  <div key={item.title} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.color}`}>
                      <item.icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

          ) : (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <button
                type="button"
                onClick={() => setStep("select")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Modifier ma sélection
              </button>

              <div className={`rounded-2xl p-5 shadow-card bg-gradient-to-br ${product.gradientClass} text-white`}>
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow text-2xl">
                    {selectedService.emoji}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Récapitulatif</p>
                    <p className="text-xl font-bold">{product.name}</p>
                    <p className="text-sm opacity-80">Numéro {selectedService.name}</p>
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
                      En choisissant le Pack Partenaire, vous débloquez votre lien de parrainage et gagnez des commissions sur chaque achat de vos filleuls.
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
              <p className="text-center text-xs text-muted-foreground">Paiement 100% sécurisé via FedaPay</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
};

export default Boutique;
