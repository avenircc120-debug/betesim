import { useState, useEffect, useRef } from "react";
import { Search, Bell, Inbox, Menu, LogIn, Copy, CheckCheck, Loader2, ShieldCheck, X, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import DrawerMenu from "@/components/DrawerMenu";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type FilterType = "Actifs" | "En attente" | "Expirés" | "Tous";
const FILTERS: FilterType[] = ["Actifs", "En attente", "Expirés", "Tous"];
const statusMap: Record<FilterType, string | null> = {
  "Actifs": "active", "En attente": "pending", "Expirés": "expired", "Tous": null,
};

const SERVICE_DOMAINS: Record<string, string> = {
  whatsapp: "whatsapp.com", telegram: "telegram.org", snapchat: "snapchat.com",
  instagram: "instagram.com", tiktok: "tiktok.com", facebook: "facebook.com",
  twitter: "twitter.com", x: "x.com", google: "google.com", discord: "discord.com",
  netflix: "netflix.com", spotify: "spotify.com", uber: "uber.com",
  airbnb: "airbnb.com", amazon: "amazon.com", apple: "apple.com",
  microsoft: "microsoft.com", linkedin: "linkedin.com", tinder: "tinder.com",
  reddit: "reddit.com", steam: "steampowered.com", twitch: "twitch.tv",
  yahoo: "yahoo.com", line: "line.me", viber: "viber.com", wechat: "wechat.com",
  paypal: "paypal.com", coinbase: "coinbase.com", binance: "binance.com",
  signal: "signal.org", github: "github.com", zoom: "zoom.us",
  skype: "skype.com", pinterest: "pinterest.com", vk: "vk.com",
};

// ── Verify Modal ──────────────────────────────────────────────────────────────

interface VerifyModalProps {
  orderId: string;
  number: string;
  service: string;
  onClose: () => void;
}

function VerifyModal({ orderId, number, service, onClose }: VerifyModalProps) {
  const { user } = useAuth();
  const [state, setState] = useState<"polling" | "received" | "banned" | "error">("polling");
  const [code, setCode] = useState<string | null>(null);
  const [fullSms, setFullSms] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_ATTEMPTS = 36; // 3 minutes max (5s × 36)

  const checkSms = async () => {
    if (!user) return;

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(
        `${supabaseUrl}/functions/v1/check-sms?order_id=${encodeURIComponent(orderId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
          },
        }
      );

      const data = await res.json();

      if (data.status === "received" && data.code) {
        setCode(data.code);
        setFullSms(data.full_sms ?? data.code);
        setState("received");
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      if (data.status === "banned") {
        setState("banned");
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      setAttempts((a) => {
        const next = a + 1;
        if (next >= MAX_ATTEMPTS) {
          setState("error");
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return next;
      });
    } catch {
      // keep polling
    }
  };

  useEffect(() => {
    checkSms();
    intervalRef.current = setInterval(checkSms, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [orderId]);

  const copyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast.success("Code copié !");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const serviceName = service.charAt(0).toUpperCase() + service.slice(1).toLowerCase();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Vérification</p>
            <h2 className="text-lg font-bold text-gray-900">{serviceName}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95 transition-transform"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Numéro */}
        <div className="bg-gray-50 rounded-2xl p-4 mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Votre numéro</p>
            <p className="font-mono text-base font-bold text-gray-900 tracking-wide">{number}</p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(number);
              toast.success("Numéro copié !");
            }}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 active:scale-95 transition-transform shadow-sm"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        {/* Instructions */}
        <p className="text-sm text-gray-500 mb-5 text-center">
          Entrez ce numéro dans <span className="font-semibold text-gray-700">{serviceName}</span>, puis revenez ici pour recevoir votre code de vérification.
        </p>

        {/* État */}
        <AnimatePresence mode="wait">
          {/* Polling */}
          {state === "polling" && (
            <motion.div
              key="polling"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-4 py-6"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-orange-100 border-t-orange-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-orange-500 text-xs font-bold">{attempts > 0 ? `${attempts * 5}s` : ""}</span>
                </div>
              </div>
              <p className="text-gray-600 font-medium text-sm text-center">
                En attente du code SMS…
              </p>
              <p className="text-gray-400 text-xs text-center max-w-xs">
                Le code apparaît automatiquement dès que {serviceName} envoie le SMS. Patientez sans fermer cette fenêtre.
              </p>
              {attempts > 0 && (
                <div className="flex gap-1">
                  {[...Array(Math.min(attempts, 6))].map((_, i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-orange-300" />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Code reçu */}
          {state === "received" && code && (
            <motion.div
              key="received"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-green-600" />
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-semibold">Code de vérification</p>
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", bounce: 0.4 }}
                  className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 rounded-2xl px-8 py-4 mb-2"
                >
                  <span className="font-mono text-4xl font-black text-orange-600 tracking-widest">
                    {code}
                  </span>
                </motion.div>
                {fullSms && fullSms !== code && (
                  <p className="text-xs text-gray-400 text-center px-4 mt-1">{fullSms}</p>
                )}
              </div>
              <button
                onClick={copyCode}
                className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 shadow-md ${
                  copied
                    ? "bg-green-500 text-white shadow-green-200"
                    : "bg-orange-500 text-white shadow-orange-200"
                }`}
              >
                {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copié !" : "Copier le code"}
              </button>
              <p className="text-xs text-gray-400 text-center">
                Entrez ce code dans {serviceName} pour finaliser la vérification.
              </p>
            </motion.div>
          )}

          {/* Banni */}
          {state === "banned" && (
            <motion.div
              key="banned"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-4"
            >
              <span className="text-4xl">⚠️</span>
              <p className="font-semibold text-gray-800 text-center">Numéro bloqué par {serviceName}</p>
              <p className="text-sm text-gray-500 text-center">
                Ce numéro a été détecté comme invalide. Contactez le support pour un remplacement gratuit.
              </p>
            </motion.div>
          )}

          {/* Timeout */}
          {state === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-4"
            >
              <span className="text-4xl">⏱️</span>
              <p className="font-semibold text-gray-800 text-center">Délai dépassé</p>
              <p className="text-sm text-gray-500 text-center">
                Aucun SMS reçu en 3 minutes. Assurez-vous que vous avez bien entré le numéro dans {serviceName}, puis réessayez.
              </p>
              <button
                onClick={() => {
                  setAttempts(0);
                  setState("polling");
                  intervalRef.current = setInterval(checkSms, 5000);
                  checkSms();
                }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 text-white font-semibold text-sm active:scale-95 transition-transform"
              >
                <RefreshCw className="w-4 h-4" />
                Réessayer
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const Historique = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { data: profile } = useProfile();
  const [filter, setFilter] = useState<FilterType>("Tous");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [verifyingOrder, setVerifyingOrder] = useState<{
    orderId: string;
    number: string;
    service: string;
  } | null>(null);

  const { data: numbers = [], isLoading, refetch } = useQuery({
    queryKey: ["subscriptions", user?.id, filter],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from("subscriptions")
        .select("id, number, country, service, smspool_order_id, status, last_sms_code, sms_received_at, expires_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const st = statusMap[filter];
      if (st) q = q.eq("status", st);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const filtered = numbers.filter((n: any) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      n.service?.toLowerCase().includes(s) ||
      n.country?.toLowerCase().includes(s) ||
      n.number?.includes(s)
    );
  });

  const getServiceIcon = (service: string) => {
    const key = service.toLowerCase().trim();
    const domain = SERVICE_DOMAINS[key];
    if (domain) {
      return (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt={service}
          className="w-6 h-6 object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      );
    }
    return <span className="text-lg">📱</span>;
  };

  const formatExpiry = (expiresAt: string) => {
    const d = new Date(expiresAt);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return "Expiré";
    if (days === 0) return "Expire aujourd'hui";
    if (days === 1) return "Expire demain";
    return `${days}j restants`;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setDrawerOpen(true)} className="text-gray-700">
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Mes numéros</h1>
        </div>
        <div className="flex items-center gap-3">
          {loading ? null : user ? (
            <button className="flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1.5">
              <span className="text-base">🪙</span>
              <span className="text-sm font-semibold text-orange-500">
                {(profile?.coin_balance ?? 0).toLocaleString("fr-FR")}
              </span>
            </button>
          ) : (
            <button
              onClick={() => navigate("/login", { state: { from: "/numeros" } })}
              className="flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white"
            >
              <LogIn className="h-4 w-4" />
              Se connecter
            </button>
          )}
          <button className="text-gray-500">
            <Bell className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Non connecté */}
      {loading ? null : !user ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-5 pt-24 px-6 text-center"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-100">
            <Inbox className="h-10 w-10 text-orange-400" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900 mb-1">Connectez-vous</p>
            <p className="text-gray-500 text-sm">pour voir vos numéros virtuels</p>
          </div>
          <button
            onClick={() => navigate("/login", { state: { from: "/numeros" } })}
            className="rounded-full bg-orange-500 px-8 py-3 text-sm font-bold text-white shadow-md active:scale-95 transition-transform"
          >
            Se connecter
          </button>
        </motion.div>
      ) : (
        <div className="px-4 pt-4 space-y-4">
          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  filter === f
                    ? "bg-orange-500 text-white shadow-sm shadow-orange-200"
                    : "bg-white text-gray-500 border border-gray-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center pt-12">
              <Loader2 className="w-7 h-7 text-orange-400 animate-spin" />
            </div>
          )}

          {/* Empty */}
          {!isLoading && filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4 pt-16 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center">
                <Inbox className="w-8 h-8 text-orange-300" />
              </div>
              <p className="text-base font-medium text-gray-500">Aucun numéro trouvé</p>
              <button
                onClick={() => navigate("/accueil")}
                className="rounded-full bg-orange-500 px-8 py-3 text-sm font-bold text-white shadow-md active:scale-95 transition-transform"
              >
                Obtenir un numéro
              </button>
            </motion.div>
          )}

          {/* Liste */}
          <AnimatePresence>
            {filtered.map((num: any, i: number) => {
              const serviceName =
                num.service
                  ? num.service.charAt(0).toUpperCase() + num.service.slice(1).toLowerCase()
                  : "Service";
              const isActive = num.status === "active";
              const hasCode = !!num.last_sms_code;

              return (
                <motion.div
                  key={num.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100"
                >
                  {/* Row 1: icon + info + badge */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50">
                      {getServiceIcon(num.service ?? "")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{serviceName}</p>
                      <p className="text-sm font-mono text-orange-500 mt-0.5 tracking-wide">{num.number}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{num.country}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                        isActive
                          ? "bg-green-100 text-green-600"
                          : num.status === "pending"
                          ? "bg-yellow-100 text-yellow-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {isActive ? "Actif" : num.status === "pending" ? "En attente" : "Expiré"}
                    </span>
                  </div>

                  {/* Row 2: expiry + code received badge */}
                  {isActive && (
                    <div className="flex items-center justify-between mt-3 px-0.5">
                      <p className="text-xs text-gray-400">
                        {num.expires_at ? formatExpiry(num.expires_at) : ""}
                      </p>
                      {hasCode && (
                        <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                          <CheckCheck className="w-3.5 h-3.5" /> Code reçu
                        </span>
                      )}
                    </div>
                  )}

                  {/* Code affiché si déjà reçu */}
                  {hasCode && num.last_sms_code && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Code de vérification</p>
                        <p className="font-mono text-2xl font-black text-orange-600 tracking-widest">
                          {num.last_sms_code}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(num.last_sms_code);
                          toast.success("Code copié !");
                        }}
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-orange-200 text-orange-500 active:scale-95 transition-transform shadow-sm"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}

                  {/* Bouton Vérifier (actif + order id disponible) */}
                  {isActive && num.smspool_order_id && !hasCode && (
                    <button
                      onClick={() =>
                        setVerifyingOrder({
                          orderId: num.smspool_order_id,
                          number: num.number,
                          service: num.service ?? "service",
                        })
                      }
                      className="mt-3 w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold py-3 rounded-xl transition-colors shadow-sm shadow-orange-200 text-sm"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Vérifier — recevoir le code SMS
                    </button>
                  )}

                  {/* Revérifier si code déjà reçu */}
                  {isActive && num.smspool_order_id && hasCode && (
                    <button
                      onClick={() => {
                        setVerifyingOrder({
                          orderId: num.smspool_order_id,
                          number: num.number,
                          service: num.service ?? "service",
                        });
                      }}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 text-gray-400 text-xs font-medium py-1.5 active:scale-95 transition-transform"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Attendre un nouveau code
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Verify Modal */}
      <AnimatePresence>
        {verifyingOrder && (
          <VerifyModal
            orderId={verifyingOrder.orderId}
            number={verifyingOrder.number}
            service={verifyingOrder.service}
            onClose={() => {
              setVerifyingOrder(null);
              refetch();
            }}
          />
        )}
      </AnimatePresence>

      <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <BottomNav />
    </div>
  );
};

export default Historique;
