import { ShoppingBag, Phone, Users, ArrowLeft, CreditCard, Check, Search, MapPin, Loader2, Wallet, Lock, Unlock, Sparkles, Copy, MessageCircle, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createFedaPayTransaction } from "@/lib/fedapay";

// ─── Types ───────────────────────────────────────────────────────────────────
type Step = "offer" | "select" | "payment" | "delivered";
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

// Indicatif + amorce visible pour l'aperçu masqué (style « +33 6 45 ** ** ** »)
const COUNTRY_DIAL: Record<string, string> = {
  FR: "+33", US: "+1",  GB: "+44", DE: "+49", ES: "+34", IT: "+39", CA: "+1",
  RU: "+7", CN: "+86", IN: "+91", BR: "+55", JP: "+81", KR: "+82", TR: "+90",
  PL: "+48", NL: "+31", BE: "+32", PT: "+351", RO: "+40", UA: "+380",
  SE: "+46", NO: "+47", DK: "+45", FI: "+358", CH: "+41", AT: "+43", IE: "+353",
  GR: "+30", CZ: "+420", HU: "+36", BG: "+359", HR: "+385", SK: "+421",
  AR: "+54", MX: "+52", CO: "+57", CL: "+56", PE: "+51", VE: "+58",
  AU: "+61", NZ: "+64", ZA: "+27", EG: "+20", NG: "+234", KE: "+254", MA: "+212",
  ID: "+62", TH: "+66", VN: "+84", PH: "+63", MY: "+60", SG: "+65", HK: "+852",
  IL: "+972", AE: "+971", SA: "+966",
};

// Amorce plausible (préfixe mobile + 1er duo) — masque le reste
const COUNTRY_TEASE: Record<string, string> = {
  FR: "6 45", US: "415 22", GB: "7 82", DE: "1 51", ES: "6 12", IT: "3 47", CA: "514 22",
  RU: "9 12", CN: "1 38", IN: "9 87", BR: "1 19", JP: "9 0", KR: "1 0", TR: "5 32",
  PL: "5 12", NL: "6 12", BE: "4 78", PT: "9 12", RO: "7 21", UA: "9 7",
  SE: "7 0", NO: "9 12", DK: "2 12", FI: "4 0", CH: "7 8", AT: "6 64", IE: "8 7",
  GR: "6 9", CZ: "6 0", HU: "2 0", BG: "8 7", HR: "9 1", SK: "9 0",
  AR: "1 1", MX: "5 5", CO: "3 0", CL: "9 7", PE: "9 7", VE: "4 12",
  AU: "4 12", NZ: "2 1", ZA: "8 2", EG: "1 0", NG: "8 0", KE: "7 0", MA: "6 12",
  ID: "8 1", TH: "8 1", VN: "9 0", PH: "9 17", MY: "1 2", SG: "8 1", HK: "5 1",
  IL: "5 0", AE: "5 0", SA: "5 0",
};

function maskedPreview(shortName?: string | null): string {
  const key = shortName ? shortName.toUpperCase() : null;
  const dial = key ? (COUNTRY_DIAL[key] || "+••") : "+••";
  const tease = key ? (COUNTRY_TEASE[key] || "") : "";
  return tease
    ? `${dial} ${tease} ** ** **`
    : `${dial} ** ** ** ** **`;
}

const PRODUCTS = {
  simple: {
    id: "simple" as Product,
    name: "Achat Direct",
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
      "Statut Partenaire officiel WINPACK",
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Navigation entre les écrans
  const [step, setStep] = useState<Step>("offer");

  // Sélections
  const [selectedCountry, setSelectedCountry] = useState<string>("0");
  const [selectedCountryName, setSelectedCountryName] = useState<string>("N'importe quel pays");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product>(() => {
    const p = searchParams.get("product");
    return p === "partner" ? "partner" : "simple";
  });

  // UI
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [search, setSearch] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  // Révélation après paiement
  const [deliveredNumber, setDeliveredNumber] = useState<string | null>(null);
  const [deliveredSubscriptionId, setDeliveredSubscriptionId] = useState<string | null>(null);
  const [deliveredService, setDeliveredService] = useState<{ id: string; name: string; emoji: string; color: string } | null>(null);
  const [deliveredCountryName, setDeliveredCountryName] = useState<string>("");
  const [deliveredExpiresAt, setDeliveredExpiresAt] = useState<string | null>(null);

  // Lien partenaire 1win (admin-éditable)
  const { data: partnerLink } = useQuery({
    queryKey: ["partner-link"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("partner-pack", { body: { action: "settings-get" } });
      return (data?.partner_link as string) ?? "";
    },
    staleTime: 60_000,
  });

  // Polling SMS pour la révélation
  const { data: deliveredSubscription } = useQuery({
    queryKey: ["delivered-subscription", deliveredSubscriptionId],
    queryFn: async () => {
      if (!deliveredSubscriptionId) return null;
      const { data } = await supabase.from("subscriptions").select("*").eq("id", deliveredSubscriptionId).maybeSingle();
      return data;
    },
    enabled: !!deliveredSubscriptionId && step === "delivered",
    refetchInterval: 8000,
  });

  // Catalogue WINPACK (pays disponibles)
  const { data: catalogCountries, isLoading: loadingCountries } = useQuery({
    queryKey: ["winpack-countries"],
    queryFn: async () => {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/winpack-catalog?action=countries`,
        { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } }
      );
      const json = await resp.json();
      return json.success ? json.data as { id: string; name: string; short_name: string }[] : [];
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  // ── Récupère le subscription_id à partir du numéro livré ──────────────────
  const fetchSubscriptionId = useCallback(async (userId: string, number: string): Promise<string | null> => {
    const { data } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("number", number)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as any)?.id ?? null;
  }, []);

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
      // ─── Pack Partenaire : flow dédié en 4 étapes ─────────────────────────
      if (savedProduct === "partner") {
        toast.loading("Activation de votre Pack Partenaire…", { id: "delivery" });
        (async () => {
          try {
            const { data, error } = await supabase.functions.invoke("partner-pack", {
              body: {
                action: "init",
                user_id: user.uid ?? user.id,
                fedapay_transaction_id: transactionId,
              },
            });
            toast.dismiss("delivery");
            if (error) throw new Error(error.message);
            if (!data?.success) throw new Error(data?.error || "Erreur d'activation du Pack Partenaire");
            queryClient.invalidateQueries({ queryKey: ["profile"] });
            toast.success("Pack Partenaire activé ! Suivez les étapes pour recevoir votre numéro Telegram.", { duration: 5000 });
            navigate(`/pack-partenaire?id=${data.pack.id}`);
          } catch (e: any) {
            toast.dismiss("delivery");
            toast.error(e.message || "Erreur lors de l'activation du Pack Partenaire. Contactez le support.");
          }
        })();
        return;
      }

      // ─── Achat Direct : flow classique ────────────────────────────────────
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
            // ─── Révélation du numéro à l'écran ──────────────────────────────
            const realNumber: string | undefined = data?.number;
            if (realNumber) {
              const svcMeta = ALL_SERVICES.find((s) => s.id === savedServiceId)
                ?? { id: savedServiceId, name: savedServiceName, emoji: "📱", color: "bg-primary" };
              const subId = await fetchSubscriptionId(user.uid ?? user.id, realNumber);

              setDeliveredNumber(realNumber);
              setDeliveredService(svcMeta);
              setDeliveredCountryName(
                catalogCountries?.find((c) => c.id === savedCountry)?.name
                ?? (savedCountry === "0" ? "N'importe quel pays" : savedCountry)
              );
              setDeliveredSubscriptionId(subId);
              setDeliveredExpiresAt(data?.expires_at ?? null);
              setStep("delivered");
              toast.success("Votre numéro est débloqué !", { duration: 4000 });
            } else {
              toast.success(`Numéro ${savedServiceName} livré ! Consultez votre historique.`, { duration: 6000 });
            }
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

  // ── Sélection du service → redirection auto vers paiement ─────────────────
  const handleSelectService = useCallback((s: Service) => {
    setSelectedService(s);
    requireAuth(() => setStep("payment"));
  }, [requireAuth]);

  // ── Paiement Pack Partenaire — direct, sans choix service/pays ────────────
  const handlePartnerPack = useCallback(async () => {
    if (!user) return;
    setIsPaying(true);
    try {
      const product = PRODUCTS.partner;
      sessionStorage.setItem("pending_product", "partner");
      // Service & pays neutres : la livraison du Telegram se fera à l'étape 4 du flow dédié
      sessionStorage.setItem("pending_service", "telegram");
      sessionStorage.setItem("pending_service_name", "Telegram");
      sessionStorage.setItem("pending_country", "0");

      const result = await createFedaPayTransaction({
        amount: product.price,
        description: "Pack Partenaire WINPACK",
        userId: user.id,
        paymentType: "partner_pack",
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
  }, [user]);

  // ── Paiement FedaPay ──────────────────────────────────────────────────────
  const handlePay = useCallback(async () => {
    if (!user || !selectedService) return;
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
    if (!user || !selectedService) return;
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
      // ─── Révélation du numéro à l'écran ────────────────────────────────────
      const realNumber: string = data.number;
      const subId = await fetchSubscriptionId(user.id, realNumber);
      setDeliveredNumber(realNumber);
      setDeliveredService(selectedService);
      setDeliveredCountryName(
        catalogCountries?.find((c) => c.id === selectedCountry)?.name
        ?? (selectedCountry === "0" ? "N'importe quel pays" : selectedCountryName)
      );
      setDeliveredSubscriptionId(subId);
      setDeliveredExpiresAt(data?.expires_at ?? null);
      setStep("delivered");
      toast.success("Votre numéro est débloqué !");
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
    : catalogCountries?.find(c => c.id === selectedCountry)
      ? `[${catalogCountries.find(c => c.id === selectedCountry)?.short_name}] ${catalogCountries.find(c => c.id === selectedCountry)?.name}`
      : selectedCountryName;

  // Si Partenaire est déjà activé, on force "simple"
  useEffect(() => {
    if (profile?.is_partner && selectedProduct === "partner") {
      setSelectedProduct("simple");
    }
  }, [profile?.is_partner, selectedProduct]);

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-6">

        {/* En-tête */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Boutique</h1>
          <p className="text-sm text-muted-foreground">+1 000 services disponibles via WINPACK</p>
        </motion.div>

        <AnimatePresence mode="wait">

          {/* ═══════════════════════════════════════════════════════════
              ÉCRAN 1 — CHOIX DE L'OFFRE (Achat Direct ou Pack Partenaire)
          ═══════════════════════════════════════════════════════════ */}
          {step === "offer" && (
            <motion.div
              key="offer"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
                  Choisissez votre offre
                </h2>
                <p className="text-sm text-muted-foreground">
                  Sélectionnez d'abord la formule qui vous convient.
                </p>
              </div>

              <div className="space-y-3">
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
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${p.gradientClass}`}>
                          <ShoppingBag className="h-6 w-6 text-white" />
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

                      {/* Détail des avantages — toujours visible sur l'écran offre */}
                      <div className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
                        {p.features.map((f) => (
                          <div key={f} className="flex items-start gap-1.5">
                            <Check className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${p.includesPartner ? "text-amber-600" : "text-primary"}`} />
                            <p className="text-xs text-muted-foreground">{f}</p>
                          </div>
                        ))}
                      </div>
                    </motion.button>
                  ))}

                {profile?.is_partner && (
                  <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5">
                    <Check className="h-4 w-4 text-green-600 shrink-0" />
                    <p className="text-xs text-green-700 font-medium">Vous êtes déjà Partenaire — Numéro à 2 000 FCFA.</p>
                  </div>
                )}
              </div>

              <Button
                onClick={() => {
                  if (selectedProduct === "partner") {
                    requireAuth(handlePartnerPack);
                  } else {
                    requireAuth(() => setStep("select"));
                  }
                }}
                disabled={isPaying}
                className="h-13 w-full rounded-xl gradient-primary text-primary-foreground font-bold text-base shadow-glow py-4 disabled:opacity-50"
              >
                {selectedProduct === "partner"
                  ? (isPaying ? "Redirection vers le paiement…" : "Payer 2 500 FCFA — Pack Partenaire")
                  : "Continuer — Choisir pays & service"}
              </Button>

              {/* Comment ça marche */}
              <div className="space-y-2 pt-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comment ça marche</h3>
                {[
                  { icon: ShoppingBag, title: "1. Choisissez votre offre",         desc: "Achat Direct (2 000F) ou Pack Partenaire (2 500F)" },
                  { icon: MapPin,      title: "2. Pays → Service",                 desc: "Choisissez où et pour quel réseau social vous voulez un numéro" },
                  { icon: CreditCard,  title: "3. Paiement sécurisé",              desc: "FedaPay — Mobile Money, carte bancaire…" },
                  { icon: Phone,       title: "4. Numéro livré",                   desc: "Votre numéro virtuel apparaît dans votre historique instantanément" },
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
              ÉCRAN 2 — SÉLECTION (Pays → Service) — sans prix affiché
          ═══════════════════════════════════════════════════════════ */}
          {step === "select" && (
            <motion.div
              key="select"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Retour */}
              <button
                type="button"
                onClick={() => setStep("offer")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Changer d'offre
              </button>

              {/* Bandeau offre choisie (sans prix) */}
              <div className="rounded-2xl bg-card border border-border p-3 shadow-card flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${product.gradientClass}`}>
                  <ShoppingBag className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Offre sélectionnée</p>
                  <p className="font-bold text-foreground text-sm">{product.name}</p>
                </div>
              </div>

              {/* ── 1. PAYS ── */}
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
                  Choisissez le pays
                </h2>

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
                    {(catalogCountries ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.short_name ? `[${c.short_name}] ` : ""}{c.name}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">▾</div>
                </div>
              </div>

              {/* ── 2. SERVICE — clic = redirection paiement ── */}
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
                  Choisissez le service
                  <span className="ml-auto normal-case font-normal text-primary text-xs">Cliquez pour continuer →</span>
                </h2>

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

                {/* Grille services — clic = paiement direct */}
                <div className="grid grid-cols-4 gap-2 max-h-80 overflow-y-auto pr-1">
                  {filteredServices.map((s) => (
                    <motion.button
                      key={s.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSelectService(s)}
                      className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-transparent bg-card p-2.5 shadow-sm transition-all hover:border-primary hover:bg-primary/5"
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
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              ÉCRAN 3 — INTERFACE DE PAIEMENT (sans choix d'offre)
          ═══════════════════════════════════════════════════════════ */}
          {step === "payment" && selectedService && (
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

              {/* ╔═══════════════════════════════════════════════════════════╗
                  ║   TEASER : « Votre numéro est prêt » (masqué + verrou)    ║
                  ╚═══════════════════════════════════════════════════════════╝ */}
              {(() => {
                const shortName = catalogCountries?.find((c) => c.id === selectedCountry)?.short_name;
                return (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-card to-accent/10 border-2 border-primary/30 p-5 shadow-glow">
                    <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
                    <div className="relative space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                          Votre numéro est prêt
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${selectedService.color}`}>
                          <span className="text-xl">{selectedService.emoji}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground truncate">
                            {selectedService.name} · {selectedCountryDisplay}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-xl bg-background/80 backdrop-blur p-4 border border-border relative">
                        <p className="text-2xl font-mono font-bold tracking-wider text-foreground/80 select-none">
                          {maskedPreview(shortName)}
                        </p>
                        <div className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-400/40">
                          <Lock className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        🔒 Numéro <strong>verrouillé</strong>. Pour le débloquer et l'utiliser dans {selectedService.name}, validez le paiement ci-dessous.
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* ── BOUTON DE PAIEMENT ── */}
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
                      <Unlock className="h-5 w-5" />
                      <span>Débloquer mon numéro — {product.price.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  )}
                </Button>

                {/* Payer depuis le Wallet (si solde suffisant + achat direct) */}
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

          {/* ═══════════════════════════════════════════════════════════
              ÉCRAN 4 — RÉVÉLATION : vrai numéro + SMS + CTA 1win
          ═══════════════════════════════════════════════════════════ */}
          {step === "delivered" && deliveredNumber && (
            <motion.div
              key="delivered"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="space-y-5"
            >
              {/* Bannière succès */}
              <div className="rounded-2xl bg-accent/10 border border-accent/30 p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
                  <Check className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="font-bold text-foreground text-sm">Paiement confirmé</p>
                  <p className="text-[11px] text-muted-foreground">Votre numéro est débloqué et actif</p>
                </div>
              </div>

              {/* Carte révélation : numéro complet visible */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/15 via-card to-primary/15 border-2 border-accent/40 p-5 shadow-glow">
                <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-accent/15 blur-2xl" />
                <div className="relative space-y-4">
                  <div className="flex items-center gap-2">
                    <Unlock className="h-4 w-4 text-accent" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
                      Votre vrai numéro
                    </p>
                  </div>

                  {deliveredService && (
                    <div className="flex items-center gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${deliveredService.color}`}>
                        <span className="text-xl">{deliveredService.emoji}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground truncate">
                          {deliveredService.name} · {deliveredCountryName || "International"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl bg-background p-4 border border-border">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                      Numéro complet
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-mono font-bold text-foreground flex-1 break-all">
                        {deliveredNumber}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(deliveredNumber);
                          toast.success("Numéro copié");
                        }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground hover:text-foreground border border-border"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {deliveredExpiresAt && (
                    <p className="text-[11px] text-muted-foreground">
                      Valide jusqu'au {new Date(deliveredExpiresAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                    </p>
                  )}
                </div>
              </div>

              {/* Carte SMS */}
              <div className="rounded-2xl bg-card p-4 shadow-card border border-border space-y-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Code de validation (SMS)
                  </p>
                </div>

                {(deliveredSubscription as any)?.last_sms_code ? (
                  <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
                    <div className="flex items-center gap-2">
                      <p className="text-3xl font-mono font-bold text-accent tracking-widest flex-1">
                        {(deliveredSubscription as any).last_sms_code}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText((deliveredSubscription as any).last_sms_code);
                          toast.success("Code copié");
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-card text-muted-foreground hover:text-foreground border border-border"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      En attente du SMS… (jusqu'à 3 min)
                    </p>
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  ➜ Saisissez le numéro ci-dessus dans {deliveredService?.name ?? "votre application"}, puis recopiez le code reçu ici.
                </p>
              </div>

              {/* CTA 1win — finalité du parcours */}
              {partnerLink && (
                <div className="rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-2 border-amber-400/40 p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500">
                      <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-foreground text-sm">Finalisez votre inscription</p>
                      <p className="text-[11px] text-amber-700">
                        Inscrivez-vous sur 1win avec votre nouveau numéro pour activer votre compte
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => window.open(partnerLink, "_blank", "noopener,noreferrer")}
                    className="h-12 w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-glow"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    M'inscrire sur 1win
                  </Button>
                </div>
              )}

              {/* Actions secondaires */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate("/historique")}
                  className="h-11 rounded-xl"
                >
                  Mon historique
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeliveredNumber(null);
                    setDeliveredSubscriptionId(null);
                    setDeliveredService(null);
                    setSelectedService(null);
                    setStep("offer");
                  }}
                  className="h-11 rounded-xl"
                >
                  Nouvel achat
                </Button>
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
