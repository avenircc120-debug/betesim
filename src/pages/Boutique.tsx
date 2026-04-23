import { ShoppingBag, Phone, Users, ArrowLeft, CreditCard, Check, Search, MapPin, Wallet, Loader2, RefreshCw, Lock } from "lucide-react";
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

type Step = "product" | "country" | "service" | "confirm";
type Product = "simple" | "partner";

interface SMSPoolCountry { id: string; name: string; short_name: string; }
interface SMSPoolService { id: string; name: string; instock: number; price: number; }

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
    description: "1 numéro virtuel + parrainage activé + 10% de commission",
    features: [
      "1 numéro virtuel pour n'importe quel service",
      "Lien de parrainage personnel débloqué",
      "10% de commission sur chaque achat de vos filleuls",
      "Statut Partenaire officiel betesim",
    ],
    gradientClass: "from-amber-500 to-orange-600",
    includesPartner: true,
  },
};

const SERVICE_ICONS: Record<string, string> = {
  whatsapp: "💬", telegram: "✈️", signal: "🔒", viber: "📳", line: "💚",
  wechat: "🟢", skype: "☁️", tiktok: "🎵", instagram: "📸", facebook: "👤",
  twitter: "🐦", snapchat: "👻", linkedin: "💼", pinterest: "📌", reddit: "🤖",
  discord: "🎮", steam: "🕹️", twitch: "📺", netflix: "🎬", spotify: "🎵",
  tinder: "❤️", bumble: "🐝", google: "🔍", apple: "🍎", amazon: "📦",
  paypal: "💳", airbnb: "🏠", uber: "🚗", shein: "👗", aliexpress: "🛒",
  ebay: "🛍️", shopee: "🟠",
};

function getServiceEmoji(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  return SERVICE_ICONS[key] ?? "📱";
}

const Boutique = () => {
  const { user, requireAuth } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("product");
  const [selectedProduct, setSelectedProduct] = useState<Product>("simple");
  const [selectedCountry, setSelectedCountry] = useState<SMSPoolCountry | null>(null);
  const [selectedService, setSelectedService] = useState<SMSPoolService | null>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [isWalletPaying, setIsWalletPaying] = useState(false);

  // Fetch countries from SMSPool (requires auth step passed)
  const { data: countries, isLoading: loadingCountries, refetch: refetchCountries } = useQuery({
    queryKey: ["smspool-countries"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("smspool-lookup", {
        body: null,
      });
      // Edge function called via GET-style URL param approach — use raw fetch
      const res = await supabase.functions.invoke("smspool-lookup");
      // Actually need to pass action via query param — use fetch directly
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smspool-lookup?action=countries`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const json = await resp.json();
      if (!json.success) throw new Error(json.error ?? "Erreur chargement pays");
      return json.data as SMSPoolCountry[];
    },
    enabled: step === "country" && !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch services for selected country
  const { data: services, isLoading: loadingServices, refetch: refetchServices } = useQuery({
    queryKey: ["smspool-services", selectedCountry?.id],
    queryFn: async () => {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smspool-lookup?action=services&country=${selectedCountry!.id}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const json = await resp.json();
      if (!json.success) throw new Error(json.error ?? "Erreur chargement services");
      return json.data as SMSPoolService[];
    },
    enabled: step === "service" && !!selectedCountry,
    staleTime: 2 * 60 * 1000,
  });

  // Handle FedaPay return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get("id");
    const status = params.get("status");
    if (!transactionId || !status) return;
    if (!user) return;
    window.history.replaceState({}, "", window.location.pathname);
    const savedProduct = (sessionStorage.getItem("pending_product") as Product) || "simple";
    const savedServiceId = sessionStorage.getItem("pending_service") || "";
    const savedServiceName = sessionStorage.getItem("pending_service_name") || savedServiceId;
    const savedCountry = sessionStorage.getItem("pending_country") || "0";
    sessionStorage.removeItem("pending_product");
    sessionStorage.removeItem("pending_service");
    sessionStorage.removeItem("pending_service_name");
    sessionStorage.removeItem("pending_country");

    if (status === "approved") {
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
          if (error) throw new Error(error.message || "Erreur livraison numéro");
          if (data?.wallet_credited) {
            toast.error(`Livraison impossible. ${data.amount_credited?.toLocaleString()} FCFA crédités dans votre wallet (utilisables pour racheter une SIM).`);
          } else if (data?.success === false) {
            throw new Error(data?.error || "Erreur livraison numéro");
          } else {
            toast.success(`Votre numéro ${savedServiceName} a été livré ! Consultez votre historique.`);
          }
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

  const product = PRODUCTS[selectedProduct];
  const walletBalance = profile?.fcfa_balance ?? 0;
  const lockedBalance = (profile as any)?.fcfa_locked_balance ?? 0;
  const canPayWithWallet = walletBalance >= product.price;
  const isAlreadyPartner = profile?.is_partner === true;

  const handleFedaPay = useCallback(async () => {
    if (!selectedCountry || !selectedService) return;
    setIsPaying(true);
    try {
      sessionStorage.setItem("pending_product", selectedProduct);
      sessionStorage.setItem("pending_service", selectedService.id);
      sessionStorage.setItem("pending_service_name", selectedService.name);
      sessionStorage.setItem("pending_country", selectedCountry.id);
      const result = await createFedaPayTransaction({
        amount: product.price,
        description: `${product.name} — Numéro ${selectedService.name} (${selectedCountry.name})`,
        userId: user!.id,
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
  }, [user, selectedProduct, selectedService, selectedCountry, product]);

  const handleWalletPay = useCallback(async () => {
    if (!selectedCountry || !selectedService) return;
    setIsWalletPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-with-wallet", {
        body: {
          service: selectedService.id,
          country: selectedCountry.id,
          product_type: selectedProduct,
          user_id: user!.uid ?? user!.id,
        },
      });
      if (error || data?.success === false) {
        throw new Error(data?.error || error?.message || "Erreur achat wallet");
      }
      toast.success(`Numéro ${selectedService.name} livré ! Consultez votre historique.`);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setStep("product");
      setSelectedCountry(null);
      setSelectedService(null);
    } catch (e: any) {
      toast.error(e.message || "Erreur achat avec wallet.");
    } finally {
      setIsWalletPaying(false);
    }
  }, [user, selectedProduct, selectedService, selectedCountry]);

  const filteredCountries = useMemo(() => {
    if (!countries) return [];
    const q = countrySearch.toLowerCase();
    return countries.filter(c => c.name.toLowerCase().includes(q) || c.short_name?.toLowerCase().includes(q));
  }, [countries, countrySearch]);

  const filteredServices = useMemo(() => {
    if (!services) return [];
    const q = serviceSearch.toLowerCase();
    return services.filter(s => s.name.toLowerCase().includes(q));
  }, [services, serviceSearch]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Boutique</h1>
          <p className="text-sm text-muted-foreground">Numéros virtuels via SMSPool — +1 000 services dans le monde</p>
        </motion.div>

        {/* Wallet balance banner */}
        {user && walletBalance > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 rounded-2xl bg-accent/10 border border-accent/20 px-4 py-3"
          >
            <Wallet className="h-5 w-5 text-accent shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                Wallet : {walletBalance.toLocaleString("fr-FR")} FCFA
              </p>
              {lockedBalance > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  {lockedBalance.toLocaleString("fr-FR")} FCFA bloqués (remboursements — utilisables pour SIM uniquement)
                </p>
              )}
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">

          {/* ── STEP 1: Product Selection ── */}
          {step === "product" && (
            <motion.div key="product" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Choisissez votre offre</h2>

                {/* Simple pack — always visible */}
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedProduct("simple")}
                  className={`w-full text-left rounded-2xl border-2 p-4 transition-all shadow-card ${selectedProduct === "simple" ? "border-primary bg-primary/5" : "border-transparent bg-card"}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700">
                      <ShoppingBag className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-foreground">Numéro Simple</p>
                      <p className="text-xs text-muted-foreground mt-0.5">1 numéro virtuel pour n'importe quel service</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-foreground">2 000</p>
                      <p className="text-xs text-muted-foreground">FCFA</p>
                    </div>
                  </div>
                </motion.button>

                {/* Partner pack — hidden if already partner */}
                {!isAlreadyPartner ? (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedProduct("partner")}
                    className={`w-full text-left rounded-2xl border-2 p-4 transition-all shadow-card ${selectedProduct === "partner" ? "border-primary bg-primary/5" : "border-transparent bg-card"}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
                        <Users className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-foreground">Pack Partenaire</p>
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-600">RECOMMANDÉ</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Numéro + parrainage + 10% commission filleuls</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-foreground">2 500</p>
                        <p className="text-xs text-muted-foreground">FCFA</p>
                      </div>
                    </div>
                  </motion.button>
                ) : (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100">
                      <Check className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-bold text-green-800 text-sm">Pack Partenaire actif</p>
                      <p className="text-xs text-green-600">Vous êtes déjà partenaire betesim. Utilisez le Numéro Simple à 2 000 FCFA.</p>
                    </div>
                  </div>
                )}
              </div>

              <Button
                onClick={() => requireAuth(() => setStep("country"))}
                className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-semibold text-base shadow-glow"
              >
                Choisir mon pays →
              </Button>

              {/* How it works */}
              <div className="space-y-2 pt-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comment ça marche</h3>
                {[
                  { icon: MapPin, title: "1. Choisissez le pays & service", desc: "Sélectionnez un pays disponible sur SMSPool, puis votre service" },
                  { icon: CreditCard, title: "2. Payez en ligne", desc: "FedaPay (Mobile Money) ou depuis votre wallet betesim" },
                  { icon: Phone, title: "3. Numéro livré instantanément", desc: "Votre numéro virtuel apparaît dans votre historique" },
                  { icon: Users, title: "4. Pack Partenaire = commissions", desc: "Parrainez vos amis et gagnez 10% sur chacun de leurs achats" },
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

          {/* ── STEP 2: Country Selection ── */}
          {step === "country" && (
            <motion.div key="country" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <button onClick={() => setStep("product")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" /> Retour
              </button>

              <div>
                <h2 className="text-lg font-bold text-foreground">Choisissez un pays</h2>
                <p className="text-sm text-muted-foreground">Pays disponibles sur SMSPool en temps réel</p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  placeholder="Rechercher un pays…"
                  className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {loadingCountries && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-3 text-sm text-muted-foreground">Chargement des pays…</span>
                </div>
              )}

              {!loadingCountries && filteredCountries.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Aucun pays trouvé</p>
                  <button onClick={() => refetchCountries()} className="mt-2 flex items-center gap-1 mx-auto text-primary text-sm hover:underline">
                    <RefreshCw className="h-4 w-4" /> Réessayer
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
                {filteredCountries.map((c) => (
                  <motion.button
                    key={c.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setSelectedCountry(c);
                      setSelectedService(null);
                      setStep("service");
                    }}
                    className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50 hover:bg-primary/5 transition-all"
                  >
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      {c.short_name && <p className="text-xs text-muted-foreground">{c.short_name}</p>}
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── STEP 3: Service Selection ── */}
          {step === "service" && (
            <motion.div key="service" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <button onClick={() => setStep("country")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" /> {selectedCountry?.name}
              </button>

              <div>
                <h2 className="text-lg font-bold text-foreground">Choisissez un service</h2>
                <p className="text-sm text-muted-foreground">Services disponibles en {selectedCountry?.name}</p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  placeholder="Rechercher un service…"
                  className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {loadingServices && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-3 text-sm text-muted-foreground">Chargement des services…</span>
                </div>
              )}

              {!loadingServices && filteredServices.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Aucun service disponible pour ce pays</p>
                  <button onClick={() => setStep("country")} className="mt-2 text-primary text-sm hover:underline">
                    Changer de pays
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
                {filteredServices.map((s) => (
                  <motion.button
                    key={s.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setSelectedService(s);
                      setStep("confirm");
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-2.5 transition-all ${
                      selectedService?.id === s.id ? "border-primary bg-primary/5" : "border-transparent bg-card shadow-sm hover:border-primary/30"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                      <span className="text-lg">{getServiceEmoji(s.name)}</span>
                    </div>
                    <p className="text-[10px] font-medium text-foreground text-center leading-tight">{s.name}</p>
                    <p className="text-[9px] text-muted-foreground">{s.instock} dispo</p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── STEP 4: Confirm & Pay ── */}
          {step === "confirm" && selectedService && selectedCountry && (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <button onClick={() => setStep("service")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" /> Modifier
              </button>

              <div className={`rounded-2xl p-5 shadow-card bg-gradient-to-br ${product.gradientClass} text-white`}>
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow text-2xl">
                    {getServiceEmoji(selectedService.name)}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Récapitulatif</p>
                    <p className="text-xl font-bold">{product.name}</p>
                    <p className="text-sm opacity-80">
                      {selectedService.name} • {selectedCountry.name}
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
              </div>

              {/* Pay with FedaPay */}
              <Button
                onClick={() => requireAuth(handleFedaPay)}
                disabled={isPaying || isWalletPaying}
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
                    Payer {product.price.toLocaleString("fr-FR")} FCFA — FedaPay
                  </>
                )}
              </Button>

              {/* Pay with wallet (if enough balance) */}
              {canPayWithWallet && (
                <Button
                  variant="outline"
                  onClick={() => requireAuth(handleWalletPay)}
                  disabled={isWalletPaying || isPaying}
                  className="h-14 w-full rounded-xl border-2 border-accent text-accent font-bold text-base disabled:opacity-40"
                >
                  {isWalletPaying ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Livraison en cours…</span>
                    </div>
                  ) : (
                    <>
                      <Wallet className="h-5 w-5 mr-2" />
                      Payer avec le wallet ({walletBalance.toLocaleString("fr-FR")} FCFA)
                    </>
                  )}
                </Button>
              )}

              <p className="text-center text-xs text-muted-foreground">Paiement 100% sécurisé</p>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
};

export default Boutique;
