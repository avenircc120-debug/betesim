import { useState, useEffect } from "react";
    import { Search, Bell, Phone, Play, ChevronRight, Loader2, ArrowLeft } from "lucide-react";
    import BottomNav from "@/components/BottomNav";
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
    instock: number;
    price: number;
    popular?: boolean;
    paymentCount?: number;
    }

    interface Country {
    id: string;
    name: string;
    short_name: string;
    }

    const POPULAR_SERVICES = new Set([
    "whatsapp", "snapchat", "telegram", "instagram", "tiktok", "facebook", "twitter", "x"
    ]);

    const PAYMENT_COUNTS: Record<string, number> = {
    whatsapp: 163, snapchat: 152, telegram: 134,
    instagram: 98, tiktok: 87, facebook: 76, twitter: 64, x: 64,
    };

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

    export default function Boutique() {
    const { user } = useAuth();
    const { profile } = useProfile();
    const navigate = useNavigate();

    const [step, setStep] = useState<Step>(1);
    const [search, setSearch] = useState("");
    const [countrySearch, setCountrySearch] = useState("");
    const [services, setServices] = useState<Service[]>([]);
    const [countries, setCountries] = useState<Country[]>([]);
    const [selectedService, setSelectedService] = useState<Service | null>(null);
    const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
    const [loadingServices, setLoadingServices] = useState(true);
    const [loadingCountries, setLoadingCountries] = useState(false);
    const [ordering, setOrdering] = useState(false);
    const [activeNumbers, setActiveNumbers] = useState(0);

    useEffect(() => {
      if (!user) return;
      supabase
        .from("virtual_numbers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active")
        .then(({ count }) => setActiveNumbers(count ?? 0));
    }, [user]);

    useEffect(() => {
      setLoadingServices(true);
      supabase.functions
        .invoke("smspool-lookup", { body: { action: "services", country: "1" } })
        .then(({ data, error }) => {
          if (error || !data?.success) { setServices([]); return; }
          const mapped: Service[] = (data.data as any[]).map((s: any) => {
            const key = (s.name ?? "").toLowerCase();
            return {
              id: String(s.id),
              name: s.name ?? "",
              instock: Number(s.instock ?? 0),
              price: Number(s.price ?? 0),
              popular: POPULAR_SERVICES.has(key),
              paymentCount: PAYMENT_COUNTS[key] ?? 0,
            };
          });
          mapped.sort((a, b) => {
            if (a.popular && !b.popular) return -1;
            if (!a.popular && b.popular) return 1;
            return a.name.localeCompare(b.name);
          });
          setServices(mapped);
        })
        .finally(() => setLoadingServices(false));
    }, []);

    const handleServiceSelect = async (service: Service) => {
      setSelectedService(service);
      setStep(2);
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

    const handleCountrySelect = (country: Country) => {
      setSelectedCountry(country);
      setStep(3);
    };

    const goBack = () => {
      if (step === 2) { setStep(1); setSelectedService(null); }
      else if (step === 3) { setStep(2); setSelectedCountry(null); }
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
        navigate("/historique");
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

    return (
      <div className="min-h-screen bg-[#f5f5f5] pb-24">
        {/* Header */}
        <div className="bg-white px-4 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
          {step > 1 ? (
            <button onClick={goBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          ) : (
            <div className="w-8 h-8" />
          )}
          <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5">
              <span className="text-orange-500 text-xs">🔗</span>
              <span className="text-orange-600 font-bold text-sm">{activeNumbers}</span>
            </div>
            <Bell className="w-5 h-5 text-gray-400" />
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Active numbers card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-4 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                <Phone className="w-5 h-5 text-orange-500" />
              </div>
              <span className="text-gray-500 text-sm font-medium">Numéros actifs</span>
            </div>
            <p className="text-4xl font-bold text-gray-900">{activeNumbers}</p>
          </motion.div>

          {/* Tutorials */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-gray-900 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                ✨ TUTORIELS
              </span>
              <span className="text-gray-400 text-sm">Apprends en moins d'une minute</span>
            </div>
            {[{ n: 1, title: "Comment ça marche" }, { n: 2, title: "Acheter après recharge" }].map(({ n, title }) => (
              <div key={n} className="bg-gray-800 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-700 transition-colors">
                <div className="w-10 h-10 bg-orange-500/20 border border-orange-500/30 rounded-xl flex items-center justify-center shrink-0">
                  <Play className="w-4 h-4 text-orange-400 fill-orange-400" />
                </div>
                <div className="flex-1">
                  <p className="text-orange-400 text-xs font-bold mb-0.5">TUTORIEL {n}</p>
                  <p className="text-white text-sm font-semibold">{title}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </div>
            ))}
          </motion.div>

          {/* Service selection */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-4 shadow-sm space-y-4"
          >
            <div>
              <h2 className="text-gray-900 font-bold text-base">Choisir un service</h2>
              <p className="text-gray-400 text-sm">
                {step === 1 ? `${filteredServices.length} services disponibles`
                  : step === 2 ? "Choisir un pays"
                  : "Confirmer la commande"}
              </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center">
              {[1, 2, 3].map((s, i) => (
                <div key={s} className="flex items-center flex-1 last:flex-none">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    step === s ? "bg-orange-500 text-white shadow-md shadow-orange-200"
                      : step > s ? "bg-orange-100 text-orange-500"
                      : "bg-gray-100 text-gray-400"
                  }`}>
                    {s}
                  </div>
                  {i < 2 && <div className={`flex-1 h-0.5 mx-1 transition-colors ${step > s ? "bg-orange-300" : "bg-gray-100"}`} />}
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="Rechercher un service..." value={search} onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-orange-300 focus:bg-white transition-colors" />
                  </div>
                  {loadingServices ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
                  ) : filteredServices.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">Aucun service trouvé</p>
                  ) : (
                    <div className="space-y-1 max-h-[45vh] overflow-y-auto pr-1">
                      {filteredServices.map((service) => (
                        <button key={service.id} onClick={() => handleServiceSelect(service)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-orange-50 active:bg-orange-100 rounded-xl transition-colors group">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl shrink-0">
                            {getServiceEmoji(service.name)}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-gray-900 font-semibold text-sm">{service.name}</span>
                              {service.popular && (
                                <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                                  🔥 Populaire
                                </span>
                              )}
                            </div>
                            {(service.paymentCount ?? 0) > 0 && (
                              <p className="text-gray-400 text-xs mt-0.5">🌐 {service.paymentCount} paiements</p>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 shrink-0 transition-colors" />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-3">
                  <div className="bg-orange-50 rounded-xl px-3 py-2 text-sm">
                    Service : <span className="font-bold text-orange-600">{selectedService?.name}</span>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="Rechercher un pays..." value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-orange-300 focus:bg-white transition-colors" />
                  </div>
                  {loadingCountries ? (
                    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
                  ) : filteredCountries.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">Aucun pays trouvé</p>
                  ) : (
                    <div className="space-y-1 max-h-[45vh] overflow-y-auto pr-1">
                      {filteredCountries.map((country) => (
                        <button key={country.id} onClick={() => handleCountrySelect(country)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-orange-50 active:bg-orange-100 rounded-xl transition-colors group">
                          <span className="text-2xl shrink-0">{getCountryFlag(country.short_name)}</span>
                          <span className="flex-1 text-left text-sm font-semibold text-gray-800">{country.name}</span>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 shrink-0 transition-colors" />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Service</span>
                      <span className="font-bold text-gray-800">{getServiceEmoji(selectedService?.name ?? "")} {selectedService?.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Pays</span>
                      <span className="font-bold text-gray-800">{getCountryFlag(selectedCountry?.short_name ?? "")} {selectedCountry?.name}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                      <span className="text-gray-500 text-sm font-medium">Prix estimé</span>
                      <span className="font-bold text-orange-500 text-base">
                        {selectedService?.price ? `${Math.round(selectedService.price * 600).toLocaleString("fr-FR")} FCFA` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Solde wallet</span>
                      <span className="font-medium">{(profile?.fcfa_balance ?? 0).toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  </div>
                  <button onClick={handleOrder} disabled={ordering}
                    className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60 shadow-lg shadow-orange-200">
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
    