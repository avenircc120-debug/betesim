import { useState, useEffect, useCallback } from "react";
import { Search, ChevronRight, Loader2, ArrowLeft, Menu, RefreshCw, Phone, Wifi } from "lucide-react";
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
  price: number;
}

// ─── Mapping service name → domaine pour le logo ───────────────────────────
const SERVICE_DOMAINS: Record<string, string> = {
  whatsapp: "whatsapp.com",
  telegram: "telegram.org",
  snapchat: "snapchat.com",
  instagram: "instagram.com",
  tiktok: "tiktok.com",
  facebook: "facebook.com",
  twitter: "twitter.com",
  x: "x.com",
  google: "google.com",
  discord: "discord.com",
  netflix: "netflix.com",
  spotify: "spotify.com",
  uber: "uber.com",
  airbnb: "airbnb.com",
  amazon: "amazon.com",
  apple: "apple.com",
  microsoft: "microsoft.com",
  linkedin: "linkedin.com",
  tinder: "tinder.com",
  reddit: "reddit.com",
  steam: "steampowered.com",
  twitch: "twitch.tv",
  yahoo: "yahoo.com",
  "line": "line.me",
  viber: "viber.com",
  wechat: "wechat.com",
  paypal: "paypal.com",
  ebay: "ebay.com",
  "amazon aws": "aws.amazon.com",
  "gmail": "gmail.com",
  outlook: "outlook.com",
  zoom: "zoom.us",
  skype: "skype.com",
  pinterest: "pinterest.com",
  tumblr: "tumblr.com",
  vk: "vk.com",
  "ok.ru": "ok.ru",
  odnoklassniki: "ok.ru",
  signal: "signal.org",
  clubhouse: "clubhouse.com",
  bumble: "bumble.com",
  badoo: "badoo.com",
  "hinge": "hinge.co",
  grindr: "grindr.com",
  pof: "pof.com",
  meetic: "meetic.fr",
  zoosk: "zoosk.com",
  coinbase: "coinbase.com",
  binance: "binance.com",
  kraken: "kraken.com",
  bybit: "bybit.com",
  bitfinex: "bitfinex.com",
  kucoin: "kucoin.com",
  okx: "okx.com",
  "crypto.com": "crypto.com",
  robinhood: "robinhood.com",
  revolut: "revolut.com",
  "n26": "n26.com",
  stripe: "stripe.com",
  wise: "wise.com",
  "cash app": "cash.app",
  cashapp: "cash.app",
  venmo: "venmo.com",
  "google pay": "pay.google.com",
  "apple pay": "apple.com",
  "samsung pay": "samsung.com",
  shopify: "shopify.com",
  aliexpress: "aliexpress.com",
  alibaba: "alibaba.com",
  lazada: "lazada.com",
  jumia: "jumia.com",
  "booking.com": "booking.com",
  booking: "booking.com",
  expedia: "expedia.com",
  airasia: "airasia.com",
  lyft: "lyft.com",
  "grab": "grab.com",
  ola: "olacabs.com",
  deliveroo: "deliveroo.com",
  "uber eats": "ubereats.com",
  doordash: "doordash.com",
  "just eat": "just-eat.com",
  github: "github.com",
  gitlab: "gitlab.com",
  stackoverflow: "stackoverflow.com",
  "stack overflow": "stackoverflow.com",
  "microsoft teams": "microsoft.com",
  slack: "slack.com",
  notion: "notion.so",
  figma: "figma.com",
  canva: "canva.com",
  dropbox: "dropbox.com",
  "google drive": "drive.google.com",
  trello: "trello.com",
  jira: "atlassian.com",
  asana: "asana.com",
  "monday.com": "monday.com",
  "1password": "1password.com",
  lastpass: "lastpass.com",
  dashlane: "dashlane.com",
  nordvpn: "nordvpn.com",
  expressvpn: "expressvpn.com",
  surfshark: "surfshark.com",
  "hbo max": "max.com",
  hbomax: "max.com",
  "disney+": "disneyplus.com",
  disneyplus: "disneyplus.com",
  hulu: "hulu.com",
  "amazon prime": "primevideo.com",
  "apple tv": "tv.apple.com",
  "youtube": "youtube.com",
  "youtube premium": "youtube.com",
  deezer: "deezer.com",
  "apple music": "music.apple.com",
  soundcloud: "soundcloud.com",
  "ea": "ea.com",
  "electronic arts": "ea.com",
  "epic games": "epicgames.com",
  "epic": "epicgames.com",
  "battle.net": "battle.net",
  "blizzard": "blizzard.com",
  "ubisoft": "ubisoft.com",
  "rockstar": "rockstargames.com",
  "playstation": "playstation.com",
  "xbox": "xbox.com",
  "nintendo": "nintendo.com",
  "roblox": "roblox.com",
  "minecraft": "minecraft.net",
  "fortnite": "epicgames.com",
  "league of legends": "leagueoflegends.com",
  "riot games": "riotgames.com",
  imo: "imo.im",
  kakao: "kakao.com",
  "kakaotalk": "kakao.com",
  naver: "naver.com",
  "zalo": "zalo.me",
  lazaro: "lazaro.com",
  "huawei": "huawei.com",
  "xiaomi": "xiaomi.com",
  "oppo": "oppo.com",
  "vivo": "vivo.com",
};

function getServiceDomain(name: string): string {
  const key = name.toLowerCase().trim();
  if (SERVICE_DOMAINS[key]) return SERVICE_DOMAINS[key];
  // Essai générique : supprimer espaces et caractères spéciaux
  const slug = key.replace(/[^a-z0-9]/g, "");
  return `${slug}.com`;
}

// ─── Couleur de fond par initiale ──────────────────────────────────────────
const BG_COLORS = [
  "bg-blue-100 text-blue-600",
  "bg-green-100 text-green-600",
  "bg-purple-100 text-purple-600",
  "bg-pink-100 text-pink-600",
  "bg-yellow-100 text-yellow-700",
  "bg-indigo-100 text-indigo-600",
  "bg-red-100 text-red-600",
  "bg-teal-100 text-teal-600",
];
function getBgColor(name: string): string {
  const idx = (name.charCodeAt(0) || 0) % BG_COLORS.length;
  return BG_COLORS[idx];
}

// ─── Composant logo service ─────────────────────────────────────────────────
function ServiceLogo({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const domain = getServiceDomain(name);
  const src = `https://logo.clearbit.com/${domain}`;

  if (failed) {
    return (
      <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${getBgColor(name)}`}>
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      className="w-10 h-10 rounded-full object-contain bg-white border border-gray-100"
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

// ─── Composant drapeau pays ─────────────────────────────────────────────────
function CountryFlag({ short_name, name, size = "md" }: { short_name: string; name: string; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const code = short_name.toLowerCase().slice(0, 2);
  const src = `https://flagcdn.com/w40/${code}.png`;
  const cls = size === "lg" ? "w-10 h-7" : size === "sm" ? "w-6 h-4" : "w-8 h-5";

  if (failed || !code || code.length < 2) {
    return <span className="text-2xl">🌐</span>;
  }
  return (
    <img
      src={src}
      alt={name}
      className={`${cls} object-cover rounded shadow-sm`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

const POPULAR_NAMES = new Set([
  "whatsapp", "telegram", "snapchat", "instagram", "tiktok",
  "facebook", "twitter", "x", "google", "discord", "youtube",
  "spotify", "netflix", "tinder", "paypal", "uber",
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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("virtual_numbers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active")
      .then(({ count }) => setActiveNumbers(count ?? 0));
  }, [user]);


  // ── Helper : appel direct GET vers l'edge function (évite le bug de parsing POST) ─
  const callSmsPool = async (params: Record<string, string>) => {
    const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smspool-lookup`;
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${base}?${qs}`, {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) throw new Error(`Erreur réseau (${res.status})`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "Erreur de chargement");
    return json.data as any[];
  };

  // Étape 1 — charger tous les services SMSPool en temps réel
  const loadServices = useCallback(async () => {
    setLoadingServices(true);
    try {
      const raw = await callSmsPool({ action: "all_services" });
      const mapped: Service[] = raw.map((s: any) => ({
        id: String(s.id ?? s.ID ?? ""),
        name: String(s.name ?? ""),
        favourite: Number(s.favourite ?? 0),
      }));
      // Populaires en tête, puis favoris SMSPool, puis alphabétique
      mapped.sort((a, b) => {
        const aP = POPULAR_NAMES.has(a.name.toLowerCase()) ? 1 : 0;
        const bP = POPULAR_NAMES.has(b.name.toLowerCase()) ? 1 : 0;
        if (aP !== bP) return bP - aP;
        if ((b.favourite ?? 0) !== (a.favourite ?? 0)) return (b.favourite ?? 0) - (a.favourite ?? 0);
        return a.name.localeCompare(b.name);
      });
      setServices(mapped);
      setLastUpdated(new Date());
    } catch {
      toast.error("Impossible de charger les services");
      setServices([]);
    } finally {
      setLoadingServices(false);
    }
  }, []);

  useEffect(() => { loadServices(); }, [loadServices]);

  // Sélection service → étape 2 : charger les pays disponibles
  const handleServiceSelect = async (service: Service) => {
    setSelectedService(service);
    setStep(2);
    setCountrySearch("");
    setLoadingCountries(true);
    try {
      const raw = await callSmsPool({ action: "countries" });
      const mapped: Country[] = raw.map((c: any) => ({
        id: String(c.id ?? c.ID ?? ""),
        name: String(c.name ?? ""),
        short_name: String(c.short_name ?? c.cc ?? ""),
        region: c.region ?? "",
      }));
      setCountries(mapped);
    } catch (e: any) {
      toast.error(e.message ?? "Impossible de charger les pays");
      setStep(1);
    } finally {
      setLoadingCountries(false);
    }
  };

  // Sélection pays → étape 3 : prix en temps réel pour ce service + pays
  const handleCountrySelect = async (country: Country) => {
    setSelectedCountry(country);
    setStep(3);
    setPriceInfo(null);
    setLoadingPrice(true);
    try {
      const raw = await callSmsPool({
        action: "price_lookup",
        service: selectedService!.id,
        country: country.id,
      });
      if (raw.length > 0) {
        const info = raw[0];
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
    if (step === 2) { setStep(1); setSelectedService(null); setCountries([]); }
    else if (step === 3) { setStep(2); setSelectedCountry(null); setPriceInfo(null); }
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

  const priceFCFA = priceInfo && priceInfo.price > 0
    ? Math.round(priceInfo.price * 600).toLocaleString("fr-FR")
    : null;

  return (
    <div className="min-h-screen bg-[#f5f5f5] pb-24">
      <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        {step > 1 ? (
          <button onClick={goBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
        ) : (
          <button onClick={() => setDrawerOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
        )}
        <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
        <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5">
          <Phone className="w-3.5 h-3.5 text-orange-500" />
          <span className="text-orange-600 font-bold text-sm">{activeNumbers}</span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Solde wallet */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-orange-500 to-orange-400 rounded-2xl p-4 shadow-sm shadow-orange-200"
        >
          <p className="text-orange-100 text-sm font-medium mb-1">Solde wallet</p>
          <p className="text-white text-2xl font-black">
            {(profile?.fcfa_balance ?? 0).toLocaleString("fr-FR")} <span className="text-lg font-semibold">FCFA</span>
          </p>
        </motion.div>

        {/* Sélecteur principal */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="bg-white rounded-2xl p-4 shadow-sm space-y-4"
        >
          {/* Barre étapes */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-gray-900 font-bold text-base">
                {step === 1 ? "Choisir un service" : step === 2 ? "Choisir un pays" : "Confirmer"}
              </h2>
              <p className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
                {step === 1 && !loadingServices && (
                  <>
                    <Wifi className="w-3 h-3 text-green-400" />
                    <span className="text-green-500 font-medium">{services.length} services disponibles</span>
                  </>
                )}
                {step === 1 && loadingServices && "Chargement…"}
                {step === 2 && !loadingCountries && (
                  <>
                    <Wifi className="w-3 h-3 text-green-400" />
                    <span className="text-green-500 font-medium">{countries.length} pays disponibles</span>
                  </>
                )}
                {step === 2 && loadingCountries && "Chargement…"}
                {step === 3 && `${selectedService?.name} · ${selectedCountry?.name}`}
              </p>
            </div>
            <div className="flex items-center">
              {[1, 2, 3].map((s, i) => (
                <div key={s} className="flex items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step === s ? "bg-orange-500 text-white shadow-md shadow-orange-200"
                    : step > s ? "bg-orange-100 text-orange-500"
                    : "bg-gray-100 text-gray-400"
                  }`}>{s}</div>
                  {i < 2 && <div className={`w-4 h-0.5 mx-0.5 transition-colors ${step > s ? "bg-orange-300" : "bg-gray-100"}`} />}
                </div>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">

            {/* ── STEP 1 — Services ─────────────────────────────────────── */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }} className="space-y-3">

                {/* Barre de recherche */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Rechercher un service… (WhatsApp, Netflix…)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-9 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-orange-300 focus:bg-white transition-colors"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-xl leading-none">×</button>
                  )}
                </div>

                {loadingServices ? (
                  <div className="flex flex-col items-center py-12 gap-3">
                    <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
                    <p className="text-gray-400 text-sm">Chargement des services…</p>
                  </div>
                ) : filteredServices.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-2">
                    <p className="text-gray-400 text-sm">Aucun résultat pour «&nbsp;{search}&nbsp;»</p>
                    <button onClick={() => setSearch("")} className="text-orange-500 text-sm font-semibold">Effacer</button>
                  </div>
                ) : (
                  <div className="space-y-0.5 max-h-[50vh] overflow-y-auto -mx-1 px-1">
                    {filteredServices.map((service) => (
                      <button
                        key={service.id}
                        onClick={() => handleServiceSelect(service)}
                        className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-orange-50 active:bg-orange-100 rounded-xl transition-colors group"
                      >
                        {/* Logo en temps réel */}
                        <div className="shrink-0">
                          <ServiceLogo name={service.name} />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-900 font-semibold text-sm truncate">{service.name}</span>
                            {POPULAR_NAMES.has(service.name.toLowerCase()) && (
                              <span className="shrink-0 bg-orange-100 text-orange-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">Populaire</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 shrink-0 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Rafraîchir */}
                {!loadingServices && services.length > 0 && (
                  <button onClick={loadServices} className="w-full flex items-center justify-center gap-1.5 py-2 text-gray-400 text-xs hover:text-orange-500 transition-colors">
                    <RefreshCw className="w-3 h-3" />
                    {lastUpdated ? `Actualisé à ${lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Actualiser"}
                  </button>
                )}
              </motion.div>
            )}

            {/* ── STEP 2 — Pays ─────────────────────────────────────────── */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }} className="space-y-3">

                {/* Service sélectionné */}
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
                  <ServiceLogo name={selectedService?.name ?? ""} />
                  <span className="text-orange-700 font-semibold text-sm">{selectedService?.name}</span>
                </div>

                {/* Barre de recherche pays */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Rechercher un pays… (France, USA, Nigeria…)"
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="w-full pl-9 pr-9 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-orange-300 focus:bg-white transition-colors"
                  />
                  {countrySearch && (
                    <button onClick={() => setCountrySearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-xl leading-none">×</button>
                  )}
                </div>

                {loadingCountries ? (
                  <div className="flex flex-col items-center py-12 gap-3">
                    <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
                    <p className="text-gray-400 text-sm">Chargement des services…</p>
                  </div>
                ) : filteredCountries.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-2">
                    <p className="text-gray-400 text-sm">Aucun résultat pour «&nbsp;{countrySearch}&nbsp;»</p>
                    <button onClick={() => setCountrySearch("")} className="text-orange-500 text-sm font-semibold">Effacer</button>
                  </div>
                ) : (
                  <div className="space-y-0.5 max-h-[50vh] overflow-y-auto -mx-1 px-1">
                    {filteredCountries.map((country) => (
                      <button
                        key={country.id}
                        onClick={() => handleCountrySelect(country)}
                        className="w-full flex items-center gap-3 px-2 py-2.5 hover:bg-orange-50 active:bg-orange-100 rounded-xl transition-colors group"
                      >
                        {/* Drapeau en temps réel */}
                        <div className="shrink-0 w-10 flex items-center justify-center">
                          <CountryFlag short_name={country.short_name} name={country.name} size="md" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <span className="text-gray-900 font-semibold text-sm block truncate">{country.name}</span>
                          {country.region && <span className="text-gray-400 text-xs">{country.region}</span>}
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-orange-400 shrink-0 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── STEP 3 — Confirmation ─────────────────────────────────── */}
            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }} className="space-y-4">
                <div className="bg-gray-50 rounded-2xl p-4 space-y-4">

                  {/* Service */}
                  <div className="flex items-center gap-3">
                    <ServiceLogo name={selectedService?.name ?? ""} />
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Service</p>
                      <p className="text-gray-900 font-bold text-sm">{selectedService?.name}</p>
                    </div>
                  </div>

                  {/* Pays */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 flex items-center justify-center">
                      <CountryFlag short_name={selectedCountry?.short_name ?? ""} name={selectedCountry?.name ?? ""} size="lg" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Pays</p>
                      <p className="text-gray-900 font-bold text-sm">{selectedCountry?.name}</p>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-3 space-y-2">
                    {loadingPrice ? (
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                        Récupération du prix en direct…
                      </div>
                    ) : priceInfo ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 text-sm font-medium flex items-center gap-1">
                            <Wifi className="w-3 h-3 text-green-400" /> Prix en direct
                          </span>
                          <span className="font-black text-orange-500 text-lg">
                            {priceFCFA ? `${priceFCFA} FCFA` : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 text-xs">Stock disponible</span>
                          <span className={`text-xs font-bold ${priceInfo.instock > 0 ? "text-green-500" : "text-red-400"}`}>
                            {priceInfo.instock > 0 ? `${priceInfo.instock} numéro${priceInfo.instock > 1 ? "s" : ""}` : "Rupture"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-400 text-sm">Prix non disponible pour ce pays</p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-gray-400 text-xs">Solde wallet</span>
                      <span className="text-xs font-semibold text-gray-600">{(profile?.fcfa_balance ?? 0).toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  </div>
                </div>

                {priceInfo?.instock === 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 font-medium">
                    ⚠️ Aucun numéro disponible pour ce pays. Choisissez un autre pays.
                  </div>
                )}

                <button
                  onClick={handleOrder}
                  disabled={ordering || loadingPrice || priceInfo?.instock === 0}
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
