import { ShoppingBag, Phone, Users, ArrowLeft, CreditCard, Check, Search, MapPin, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useMemo } from "react";
import { createFedaPayTransaction } from "@/lib/fedapay";

// ─── Types ───────────────────────────────────────────────────────────────────
type Step = "select" | "payment";
type Product = "simple" | "partner";

interface Service {
  id: string;
  name: string;
  emoji: string;
  color: string;
  category: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────
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
    features: [
      "1 numéro virtuel actif 30 jours",
      "Livraison instantanée après paiement",
      "Compatible +1 000 services",
    ],
    gradientClass: "from-blue-500 to-blue-700",
    includesPartner: false,
  },
  partner: {
    id: "partner" as Product,
    name: "Pack Partenaire",
    price: 2500,
    description: "Numéro virtuel + parrainage activé immédiatement",
    features: [
      "1 numéro virtuel pour n'importe quel service",
      "Lien de parrainage débloqué dès le paiement",
      "10% de commission sur chaque achat de vos filleuls",
      "Statut Partenaire officiel betesim",
    ],
    gradientClass: "from-amber-500 to-orange-600",
    includesPartner: true,
  },
};

// ─── Composant ───────────────────────────────────────────────────────────────
const Boutique = () => {
  const { user, requireAuth } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();

  // Navigation entre les deux écrans
  const [step, setStep] = useState<Step>("select");

  // Sélections
  const [selectedCountry, setSelectedCountry] = useState<string>("0");
  const [selectedCountryName, setSelectedCountryName] = useState<string>("N'importe quel pays");
  const [selectedService, setSelectedService] = useState<Service>(ALL_SERVICES[0]);
  const [selectedProduct, setSelectedProduct] = useState<Product>("simple");

  // UI
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [search, setSearch] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  // Pays depuis SMSPool
  const { data: smspoolCountries, isLoading: loadingCountries } = useQuery({
    queryKey: ["smspool-countries"],
    queryFn: async () => {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smspool-lookup?action=countries`,
        { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } }
      );
      const json = await resp.json();
      return json.success ? json.data as { id: string; name: string; short_name: string }[] : [];
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  // ── Gestion du retour FedaPay ─────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get("id");
    const status = params.get("status");
    if (!transactionId || !status) return;
    if (!user) return;

    window.history.replaceState({}, "", window.location.pathname);

    const savedProduct  = (sessionStorage.getItem("pending_product") as Product) || "simple";
    const savedServiceId   = sessionStorage.getItem("pending_service") || "whatsapp";
    const savedServiceName = sessionStorage.getItem("pending_service_name") || savedServiceId;
    const savedCountry     = sessionStorage.getItem("pending_country") || "0";

    sessionStorage.removeItem("pending_product");
    sessionStorage.removeItem("pending_service");
    sessionStorage.removeItem("pending_service_name");
    sessionStorage.removeItem("pending_country");

    if (status === "approved") {
      toast.loading("Livraison du numéro en cours…", { id: "delivery" });
      (async () => {
        try {
          const { data, error } = await supabase.functions.invoke("deliver-number", {
            body: {
              service: savedServiceId,
              product_type: savedProduct,
              fedapay_transaction_id: transactionId,
              user_id: user.uid ?? user.id,
              country: savedCountry,
            },
          });

          toast.dismiss("delivery");

          if (error) {
            let detail: string | undefined;
            try {
              const ctx: any = (error as any).context;
              if (ctx?.response) {
                const body = await ctx.response.clone().json();
                detail = body?.error || body?.message;
              }
            } catch {}
            throw new Error(detail || error.message || "Erreur livraison numéro");
          }

          if (data?.wallet_credited) {
            toast.warning(
              `Aucun numéro disponible pour ${savedServiceName}. ${(data.amount_credited ?? 0).toLocaleString("fr-FR")} FCFA remboursés dans votre Wallet. Retentez depuis votre Wallet.`,
              { duration: 8000 }
            );
          } else if (data?.success === false) {
            throw new Error(data?.error || "Erreur livraison numéro");
          } else {
            // Partenaire activé immédiatement si pack partenaire
            if (savedProduct === "partner") {
              toast.success("Statut Partenaire activé ! Votre lien de parrainage est disponible.", { duration: 5000 });
            }
            toast.success(`Numéro ${savedServiceName} livré avec succès ! Consultez votre historique.`, { duration: 6000 });
          }

          queryClient.invalidateQueries({ queryKey: ["profile"] });
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
        } catch (e: any) {
          toast.dismiss("delivery");
          toast.error(e.message || "Erreur livraison. Contactez le support.");
        }
      })();
    } else {
      toast.error("Paiement annulé ou refusé. Vous pouvez réessayer.");
    }
  }, [user]);

  // ── Filtres services ──────────────────────────────────────────────────────
  const filteredServices = useMemo(() => {
    let list = ALL_SERVICES;
    if (activeCategory !== "Tous") list = list.filter((s) => s.category === activeCategory);
    if (search.trim()) list = list.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [activeCategory, search]);

  // ── Paiement FedaPay ──────────────────────────────────────────────────────
  const handlePay = useCallback(async () => {
    if (!user) return;
    setIsPaying(true);
    try {
      const product = PRODUCTS[selectedProduct];
      sessionStorage.setItem("pending_product", selectedProduct);
      sessionStorage.setItem("pending_service", selectedService.id);
      sessionStorage.setItem("pending_service_name", selectedService.name);
      sessionStorage.setItem("pending_country", selectedCountry);

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
      sessionStorage.removeItem("pending_country");
      toast.error(e.message || "Erreur paiement. Réessayez.");
    }
  }, [user, selectedProduct, selectedService, selectedCountry]);

  // ── Paiement depuis Wallet ────────────────────────────────────────────────
  const handlePayFromWallet = useCallback(async () => {
    if (!user) return;
    setIsPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-from-wallet", {
        body: {
          user_id: user.id,
          service: selectedService.id,
          country: selectedCountry,
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) {
        if (data?.retry_other_country) {
          toast.error("Aucun numéro disponible pour ce pays. Aucun débit. Choisissez un autre pays.");
          setStep("select");
        } else {
          toast.error(data?.error || "Achat impossible depuis le Wallet.");
        }
        return;
      }
      toast.success(`Numéro livré : ${data.number}`);
      setStep("select");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'achat depuis le Wallet.");
    } finally {
      setIsPaying(false);
    }
  }, [user, selectedService, selectedCountry, queryClient]);

  // ── Dérivés ───────────────────────────────────────────────────────────────
  const product        = PRODUCTS[selectedProduct];
  const walletBalance  = profile?.fcfa_balance ?? 0;
  const canPayFromWallet = selectedProduct === "simple" && walletBalance >= product.price;

  const selectedCountryDisplay = selectedCountry === "0"
    ? "🌍 N'importe quel pays"
    : smspoolCountries?.find(c => c.id === selectedCountry)
      ? `[${smspoolCountries.find(c => c.id === selectedCountry)?.short_name}] ${smspoolCountries.find(c => c.id === selectedCountry)?.name}`
      : selectedCountryName;

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-6">

        {/* En-tête */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Boutique</h1>
          <p className="text-sm text-muted-foreground">+1 000 services disponibles via SMSPool</p>
        </motion.div>

        <AnimatePresence mode="wait">

          {/* ═══════════════════════════════════════════════════════════
              ÉCRAN 1 — SÉLECTION (Pays → Service)
          ═══════════════════════════════════════════════════════════ */}
          {step === "select" && (
            <motion.div
              key="select"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >

              {/* ── 1. PAYS ── */}
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
                  Choisissez le pays
                </h2>

                {!user ? (
                  <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-center text-sm text-muted-foreground">
                    Connectez-vous pour voir les pays disponibles
                  </div>
                ) : (
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                    <select
                      value={selectedCountry}
                      onChange={(e) => {
                        setSelectedCountry(e.target.value);
                        const opt = e.target.options[e.target.selectedIndex];
                        setSelectedCountryName(opt.text);
                      }}
                      className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
                    >
                      <option value="0">🌍 N'importe quel pays (recommandé)</option>
                      {loadingCountries && <option disabled>Chargement des pays…</option>}
                      {(smspoolCountries ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.short_name ? `[${c.short_name}] ` : ""}{c.name}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">▾</div>
                  </div>
                )}
              </div>

              {/* ── 2. SERVICE ── */}
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
                  Choisissez le service
                  <span className="ml-auto normal-case font-normal text-primary text-xs">{selectedService.emoji} {selectedService.name} sélectionné</span>
                </h2>

                {!user ? (
                  <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-center text-sm text-muted-foreground">
                    Connectez-vous pour choisir votre service
                  </div>
                ) : (
                  <>
                    {/* Recherche */}
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

                    {/* Catégories */}
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

                    {/* Grille services */}
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
                  </>
                )}
              </div>

              {/* ── Bouton Continuer ── */}
              <Button
                onClick={() => requireAuth(() => setStep("payment"))}
                className="h-13 w-full rounded-xl gradient-primary text-primary-foreground font-bold text-base shadow-glow py-4"
              >
                Continuer — Choisir mon offre
              </Button>

              {/* ── Comment ça marche ── */}
              <div className="space-y-2 pt-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comment ça marche</h3>
                {[
                  { icon: MapPin,      title: "1. Pays → Service",            desc: "Choisissez où et pour quel réseau social vous voulez un numéro" },
                  { icon: ShoppingBag, title: "2. Simple (2 000F) ou Partenaire (2 500F)", desc: "Le pack Partenaire active votre lien de parrainage immédiatement" },
                  { icon: CreditCard,  title: "3. Paiement sécurisé",          desc: "FedaPay — Mobile Money, carte bancaire…" },
                  { icon: Phone,       title: "4. Numéro livré",               desc: "Votre numéro virtuel apparaît dans votre historique instantanément" },
                ].map((item) => (
                  <div key={item.title} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl gradient-primary">
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
          )}

          {/* ═══════════════════════════════════════════════════════════
              ÉCRAN 2 — INTERFACE DE PAIEMENT
          ═══════════════════════════════════════════════════════════ */}
          {step === "payment" && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              className="space-y-5"
            >
              {/* Retour */}
              <button
                type="button"
                onClick={() => setStep("select")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Modifier ma sélection
              </button>

              {/* Récapitulatif sélection */}
              <div className="rounded-2xl bg-card border border-border p-4 shadow-card space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Votre sélection</p>
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${selectedService.color}`}>
                    <span className="text-2xl">{selectedService.emoji}</span>
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{selectedService.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedCountryDisplay}</p>
                  </div>
                </div>
              </div>

              {/* ── Choix de l'offre ── */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
                  Choisissez votre offre
                </p>

                {Object.values(PRODUCTS)
                  .filter((p) => !(p.includesPartner && profile?.is_partner))
                  .map((p) => (
                    <motion.button
                      key={p.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedProduct(p.id)}
                      className={`w-full text-left rounded-2xl border-2 p-4 transition-all shadow-card ${
                        selectedProduct === p.id
                          ? "border-primary bg-primary/5"
                          : "border-transparent bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${p.gradientClass}`}>
                          <ShoppingBag className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-foreground">{p.name}</p>
                            {p.includesPartner && (
                              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-600">RECOMMANDÉ</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xl font-bold text-foreground">{p.price.toLocaleString("fr-FR")}</p>
                          <p className="text-xs text-muted-foreground">FCFA</p>
                        </div>
                      </div>
                    </motion.button>
                  ))}

                {profile?.is_partner && (
                  <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5">
                    <Check className="h-4 w-4 text-green-600 shrink-0" />
                    <p className="text-xs text-green-700 font-medium">Vous êtes déjà Partenaire — Numéro Simple à 2 000 FCFA.</p>
                  </div>
                )}

                {/* Avantages pack partenaire */}
                {selectedProduct === "partner" && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-amber-300/40 bg-amber-50/60 p-3 space-y-1.5">
                    <p className="text-xs font-bold text-amber-700">Ce qui est inclus :</p>
                    {PRODUCTS.partner.features.map((f) => (
                      <div key={f} className="flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">{f}</p>
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>

              {/* ── BOUTON DE PAIEMENT (uniquement ici) ── */}
              <div className="space-y-3 pt-1">
                <Button
                  onClick={handlePay}
                  disabled={isPaying}
                  className="h-14 w-full rounded-xl gradient-primary text-primary-foreground font-bold text-base shadow-glow disabled:opacity-50"
                >
                  {isPaying ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Connexion au paiement…</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      <span>Payer {product.price.toLocaleString("fr-FR")} FCFA via FedaPay</span>
                    </div>
                  )}
                </Button>

                {/* Payer depuis le Wallet (si solde suffisant + pack simple) */}
                {canPayFromWallet && (
                  <>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="h-px flex-1 bg-border" />
                      <span>ou utilisez votre Wallet</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <Button
                      onClick={handlePayFromWallet}
                      disabled={isPaying}
                      variant="outline"
                      className="h-12 w-full rounded-xl border-2 border-primary/40 bg-primary/5 font-semibold text-sm gap-2"
                    >
                      <Wallet className="h-4 w-4" />
                      Wallet — {walletBalance.toLocaleString("fr-FR")} FCFA disponibles
                    </Button>
                    <p className="text-center text-[11px] text-muted-foreground">
                      Votre Wallet est crédité automatiquement si aucun numéro n'est disponible.
                    </p>
                  </>
                )}

                <p className="text-center text-xs text-muted-foreground">
                  Paiement 100% sécurisé — FedaPay (Mobile Money, carte…)
                </p>
                <p className="text-center text-[11px] text-muted-foreground">
                  Si aucun numéro n'est trouvé, vous êtes remboursé automatiquement dans votre Wallet.
                </p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
};

export default Boutique;
