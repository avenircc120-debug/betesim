import { useState, useEffect } from "react";
import { Search, Bell, Phone, ChevronRight, Loader2, ArrowLeft, Menu, RefreshCw } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import DrawerMenu from "@/components/DrawerMenu";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";

type Step = 1 | 2 | 3;

interface Service {
  id: string;
  name: string;
  favourite?: number;
}

interface Country {
  id: string;
  name: string;
  short_name: string;
  region?: string;
}

interface PriceInfo {
  instock: number;
  price: number; // en USD
}

function getServiceEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("whatsapp")) return "💬";
  if (n.includes("telegram")) return "✈️";
  if (n.includes("snapchat")) return "👻";
  if (n.includes("instagram")) return "📸";
  if (n.includes("tiktok")) return "🎵";
  if (n.includes("facebook")) return "👤";
  if (n.includes("twitter") || n === "x") return "🐦";
  if (n.includes("google")) return "🔍";
  if (n.includes("discord")) return "🎮";
  if (n.includes("netflix")) return "🎬";
  if (n.includes("spotify")) return "🎶";
  if (n.includes("uber")) return "🚗";
  if (n.includes("airbnb")) return "🏠";
  if (n.includes("amazon")) return "📦";
  if (n.includes("apple")) return "🍎";
  if (n.includes("microsoft")) return "🪟";
  if (n.includes("linkedin")) return "💼";
  if (n.includes("tinder")) return "❤️";
  if (n.includes("reddit")) return "🤖";
  if (n.includes("steam")) return "🕹️";
  if (n.includes("twitch")) return "📺";
  if (n.includes("yahoo")) return "📧";
  if (n.includes("line")) return "💚";
  if (n.includes("viber")) return "📳";
  if (n.includes("wechat")) return "🟢";
  if (n.includes("paypal")) return "💳";
  if (n.includes("ebay")) return "🛒";
  if (n.includes("microsoft")) return "🪟";
  if (n.includes("outlook")) return "📨";
  if (n.includes("zoom")) return "📹";
  return "📱";
}

function getCountryFlag(shortName: string): string {
  if (!shortName || shortName.length < 2) return "🌐";
  try {
    const code = shortName.toUpperCase().slice(0, 2);
    return String.fromCodePoint(
      ...code.split("").map((c) => 0x1f1e0 - 65 + c.charCodeAt(0))
    );
  } catch {
    return "🌐";
  }
}

const POPULAR_NAMES = new Set([
  "whatsapp", "telegram", "snapchat", "instagram", "tiktok",
  "facebook", "twitter", "x", "google", "discord",
]);

export default function Boutique() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [search, setSearch] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [activeNumbers, setActiveNumbers] = useState(0);

  // Nombre de numéros actifs
  useEffect(() => {
    if (!user) return;
    supabase
      .from("virtual_numbers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active")
      .then(({ count }) => setActiveNumbers(count ?? 0));
  }, [user]);

  // Charger TOUS les services SMSPool en temps réel
  const loadServices = () => {
    setLoadingServices(true);
    supabase.functions
      .invoke("smspool-lookup", { body: { action: "all_services" } })
      .then(({ data, error }) => {
        if (error || !data?.success) {
          toast.error("Impossible de charger les services");
          setServices([]);
          return;
        }
        const mapped: Service[] = (data.data as any[]).map((s: any) => ({
          id: String(s.id),
          name: s.name ?? "",
          favourite: Number(s.favourite ?? 0),
        }));
        // Populaires en tête, puis alphabétique
        mapped.sort((a, b) => {
          const aP = POPULAR_NAMES.has(a.name.toLowerCase()) ? 1 : 0;
          const bP = POPULAR_NAMES.has(b.name.toLowerCase()) ? 1 : 0;
          if (aP !== bP) return bP - aP;
          if ((b.favourite ?? 0) !== (a.favourite ?? 0)) return (b.favourite ?? 0) - (a.favourite ?? 0);
          return a.name.localeCompare(b.name);
        });
        setServices(mapped);
      })
      .finally(() => setLoadingServices(false));
  };

  useEffect(() => {
    loadServices();
  }, []);

  // Sélection d'un service → charger les pays en temps réel
  const handleServiceSelect = async (service: Service) => {
    setSelectedService(service);
    setStep(2);
    setCountrySearch("");
    setLoadingCountries(true);
    try {
      const { data, error } = await supabase.functions.invoke("smspool-lookup", {
        body: { action: "countries" },
      });
      if (error || !data?.success) throw new Error("Impossible de charger les pays");
      setCountries(data.data);
    } catch (e: any) {
      toast.error(e.message);
      setStep(1);
    } finally {
      setLoadingCountries(false);
    }
  };

  // Sélection d'un pays → chercher le prix en temps réel pour ce service+pays
  const handleCountrySelect = async (country: Country) => {
    setSelectedCountry(country);
    setStep(3);
    setPriceInfo(null);
    setLoadingPrice(true);
    try {
      const { data, error } = await supabase.functions.invoke("smspool-lookup", {
        body: { action: "price_lookup", service: selectedService!.id, country: country.id },
      });
      if (!error && data?.success && data.data?.length > 0) {
        const info = data.data[0];
        setPriceInfo({ instock: Number(info.instock ?? 0), price: Number(info.price ?? 0) });
      } else {
        setPriceInfo(null);
      }
    } catch {
      setPriceInfo(null);
    } finally {
      setLoadingPrice(false);
    }
  };

  const goBack = () => {
    if (step === 2) {
      setStep(1);
      setSelectedService(null);
      setCountries([]);
    } else if (step === 3) {
      setStep(2);
      setSelectedCountry(null);
      setPriceInfo(null);
    }
  };

  const handleOrder = async () => {
    if (!selectedService || !selectedCountry) return;
    setOrdering(true);
    try {
      const { data, error } = await supabase.functions.invoke("purchase-from-wallet", {
        body: { service_id: selectedService.id, country_id: selectedCountry.id },
      });
      if (error || !data?.success) throw new Error(data?.error ?? "Commande échouée");
      toast.success(`Numéro obtenu : ${data.number}`);
      navigate("/numeros");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOrdering(false);
    }
  };

  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredCountries = countries.filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const isPopular = (name: string) => POPULAR_NAMES.has(name.toLowerCase());

  const priceFCFA = priceInfo && priceInfo.price > 0
    ? Math.round(priceInfo.price * 600).toLocaleString("fr-FR")
    : null;

  return (
    <div className="min-h-screen bg-[#f5f5f5] pb-24">
      <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        {step > 1 ? (
          <button
            onClick={goBack}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
        ) : (
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
        )}
        <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5">
            <span className="text-orange-500 text-xs">🔗</span>
            <span className="text-orange-600 font-bold text-sm">{activeNumbers}</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Carte numéros actifs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5 text-orange-500" />
            </div>
            <span className="text-gray-500 text-sm font-medium">Numéros actifs</span>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-4xl font-black text-gray-900">{activeNumbers}</p>
            <button
              onClick={() => navigate("/numeros")}
              className="text-orange-500 text-sm font-semibold hover:text-orange-600 transition-colors"
            >
              Voir tout →
            </button>
          </div>
        </motion.div>

        {/* Carte solde */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-gradient-to-r from-orange-500 to-orange-400 rounded-2xl p-4 shadow-sm shadow-orange-200"
        >
          <p className="text-orange-100 text-sm font-medium mb-1">Solde wallet</p>
          <p className="text-white text-2xl font-black">
            {(profile?.fcfa_balance ?? 0).toLocaleString("fr-FR")} <span className="text-lg font-semibold">FCFA</span>
          </p>
        </motion.div>

        {/* Sélecteur service → pays → commande */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 shadow-sm space-y-4"
        >
          {/* En-tête étapes */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-gray-900 font-bold text-base">
                {step === 1 ? "Choisir un service" : step === 2 ? "Choisir un pays" : "Confirmer la commande"}
              </h2>
              <p className="text-gray-400 text-sm mt-0.5">
                {step === 1
                  ? `${filteredServices.length} service${filteredServices.length > 1 ? "s" : ""} disponibles`
                  : step === 2
                  ? `${filteredCountries.length} pays disponibles`
                  : `${selectedService?.name} — ${selectedCountry?.name}`}
              </p>
            </div>
            <div className="flex items-center">
              {[1, 2, 3].map((s, i) => (
                <div key={s} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      step === s
                        ? "bg-orange-500 text-white shadow-md shadow-orange-200"
                        : step > s
                        ? "bg-orange-100 text-orange-500"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {s}
                  </div>
                  {i < 2 && (
                    <div
                      className={`w-5 h-0.5 mx-0.5 transition-colors ${
                        step > s ? "bg-orange-300" : "bg-gray-100"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* STEP 1 — Services */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {/* Barre de recherche services */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Rechercher un service… (ex : WhatsApp, Netflix)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-10 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-orange-300 focus:bg-white transition-colors"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>

                {loadingServices ? (
                  <div className="flex flex-col items-center py-10 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                    <p className="text-gray-400 text-sm">Chargement des services SMSPool…</p>
                  </div>
                ) : filteredServices.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-3">
                    <p className="text-gray-400 text-sm">Aucun service trouvé pour « {search} »</p>
                    <button
                      onClick={() => setSearch("")}
                      className="text-orange-500 text-sm font-semibold hover:text-orange-600"
                    >
                      Effacer la recherche
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[45vh] overflow-y-auto pr-1">
                    {filteredServices.map((service) => (
                      <button
                        key={service.id}
                        onClick={() => handleServiceSelect(service)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-orange-50 active:bg-orange-100 rounded-xl transition-colors group"
                      >
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl shrink-0 group-hover:bg-orange-100 transition-colors">
                          {getServiceEmoji(service.name)}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-900 font-semibold text-sm truncate">{service.name}</span>
                            {isPopular(service.name) && (
                              <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                Populaire
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 shrink-0 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Bouton rafraîchir */}
                {!loadingServices && services.length > 0 && (
                  <button
                    onClick={loadServices}
                    className="w-full flex items-center justify-center gap-2 py-2 text-gray-400 text-xs hover:text-orange-500 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Actualiser les services
                  </button>
                )}
              </motion.div>
            )}

            {/* STEP 2 — Pays */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {/* Service sélectionné */}
                <div className="flex items-center gap-2 bg-orange-50 rounded-xl px-3 py-2">
                  <span className="text-lg">{getServiceEmoji(selectedService?.name ?? "")}</span>
                  <span className="text-orange-700 font-semibold text-sm">{selectedService?.name}</span>
                </div>

                {/* Barre de recherche pays */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Rechercher un pays… (ex : France, USA)"
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="w-full pl-9 pr-10 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-orange-300 focus:bg-white transition-colors"
                  />
                  {countrySearch && (
                    <button
                      onClick={() => setCountrySearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>

                {loadingCountries ? (
                  <div className="flex flex-col items-center py-10 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                    <p className="text-gray-400 text-sm">Chargement des pays SMSPool…</p>
                  </div>
                ) : filteredCountries.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-3">
                    <p className="text-gray-400 text-sm">Aucun pays trouvé pour « {countrySearch} »</p>
                    <button
                      onClick={() => setCountrySearch("")}
                      className="text-orange-500 text-sm font-semibold hover:text-orange-600"
                    >
                      Effacer la recherche
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[45vh] overflow-y-auto pr-1">
                    {filteredCountries.map((country) => (
                      <button
                        key={country.id}
                        onClick={() => handleCountrySelect(country)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-orange-50 active:bg-orange-100 rounded-xl transition-colors group"
                      >
                        <span className="text-2xl shrink-0">{getCountryFlag(country.short_name)}</span>
                        <div className="flex-1 text-left min-w-0">
                          <span className="text-sm font-semibold text-gray-800 block truncate">{country.name}</span>
                          {country.region && (
                            <span className="text-xs text-gray-400">{country.region}</span>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 shrink-0 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* STEP 3 — Confirmation */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Service</span>
                    <span className="font-bold text-gray-800">
                      {getServiceEmoji(selectedService?.name ?? "")} {selectedService?.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Pays</span>
                    <span className="font-bold text-gray-800">
                      {getCountryFlag(selectedCountry?.short_name ?? "")} {selectedCountry?.name}
                    </span>
                  </div>

                  <div className="border-t border-gray-200 pt-3">
                    {loadingPrice ? (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-sm font-medium">Prix réel</span>
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                          <span className="text-gray-400 text-sm">Chargement…</span>
                        </div>
                      </div>
                    ) : priceInfo ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 text-sm font-medium">Prix réel</span>
                          <div className="text-right">
                            {priceFCFA ? (
                              <span className="font-bold text-orange-500 text-base">{priceFCFA} FCFA</span>
                            ) : (
                              <span className="text-gray-400 text-sm">Prix non disponible</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-gray-400 text-xs">Stock disponible</span>
                          <span className={`text-xs font-semibold ${priceInfo.instock > 0 ? "text-green-500" : "text-red-400"}`}>
                            {priceInfo.instock > 0 ? `${priceInfo.instock} numéro${priceInfo.instock > 1 ? "s" : ""}` : "Rupture de stock"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-sm font-medium">Prix</span>
                        <span className="text-gray-400 text-sm">Non disponible pour ce pays</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                    <span>Solde wallet</span>
                    <span className="font-medium">{(profile?.fcfa_balance ?? 0).toLocaleString("fr-FR")} FCFA</span>
                  </div>
                </div>

                {priceInfo && priceInfo.instock === 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">
                    ⚠️ Aucun numéro disponible pour ce pays actuellement. Essayez un autre pays.
                  </div>
                )}

                <button
                  onClick={handleOrder}
                  disabled={ordering || loadingPrice || (priceInfo !== null && priceInfo.instock === 0)}
                  className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60 shadow-lg shadow-orange-200"
                >
                  {ordering && <Loader2 className="w-5 h-5 animate-spin" />}
                  {ordering ? "Commande en cours…" : "Commander ce numéro"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
}
