import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Bell, Inbox, Menu, LogIn, Copy, CheckCheck, Loader2, ShieldCheck, X, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import DrawerMenu from "@/components/DrawerMenu";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [state, setState] = useState<"polling" | "received" | "expired" | "error">("polling");
  const [code, setCode] = useState<string | null>(null);
  const [fullSms, setFullSms] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);
  const MAX_WAIT_S = 180; // 3 minutes

  const handleReceived = useCallback((smsCode: string, smsFull: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCode(smsCode);
    setFullSms(smsFull);
    setState("received");
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const handleExpired = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setState("expired");
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // ── Supabase Realtime: listen for webhook updates ─────────────────────────
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`sms-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "subscriptions",
          filter: `smspool_order_id=eq.${orderId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (row?.last_sms_code) {
            handleReceived(row.last_sms_code, row.last_sms_full ?? row.last_sms_code);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, user, handleReceived]);

  // ── Fallback: poll check-sms Edge Function every 7s ──────────────────────
  const pollOnce = useCallback(async () => {
    if (doneRef.current || !user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-sms?order_id=${encodeURIComponent(orderId)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );
      if (!res.ok) return; // edge fn error — keep polling silently
      const data = await res.json();
      if (data.status === "received" && data.code) {
        handleReceived(data.code, data.full_sms ?? data.code);
      } else if (data.status === "expired") {
        handleExpired();
      }
    } catch { /* network error — keep polling */ }
  }, [orderId, user, handleReceived, handleExpired]);

  useEffect(() => {
    pollOnce();
    pollRef.current = setInterval(pollOnce, 7000);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_WAIT_S && !doneRef.current) {
          setState("error");
          doneRef.current = true;
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
        }
        return next;
      });
    }, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pollOnce]);

  const restart = () => {
    doneRef.current = false;
    setSeconds(0);
    setState("polling");
    pollOnce();
    pollRef.current = setInterval(pollOnce, 7000);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_WAIT_S && !doneRef.current) {
          setState("error");
          doneRef.current = true;
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
        }
        return next;
      });
    }, 1000);
  };

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
                  <span className="text-orange-500 text-xs font-bold">{seconds > 0 ? `${seconds}s` : ""}</span>
                </div>
              </div>
              <p className="text-gray-600 font-medium text-sm text-center">
                En attente du code SMS…
              </p>
              <p className="text-gray-400 text-xs text-center max-w-xs">
                Le code apparaît automatiquement dès que {serviceName} envoie le SMS. Patientez sans fermer cette fenêtre.
              </p>
              {/* Progress bar */}
              <div className="w-full max-w-xs h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-400 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min((seconds / MAX_WAIT_S) * 100, 100)}%` }}
                />
              </div>
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

          {/* Expiré */}
          {state === "expired" && (
            <motion.div
              key="expired"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-4"
            >
              <span className="text-4xl">⏳</span>
              <p className="font-semibold text-gray-800 text-center">Fenêtre expirée</p>
              <p className="text-sm text-gray-500 text-center">
                L'ordre SMSPool est fermé. Entrez le numéro dans {serviceName} puis appuyez sur Réessayer — un nouveau code peut encore arriver via webhook.
              </p>
              <button
                onClick={restart}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 text-white font-semibold text-sm active:scale-95 transition-transform"
              >
                <RefreshCw className="w-4 h-4" />
                Réessayer
              </button>
            </motion.div>
          )}

          {/* Timeout 3min */}
          {state === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-4"
            >
              <span className="text-4xl">⏱️</span>
              <p className="font-semibold text-gray-800 text-center">3 minutes écoulées</p>
              <p className="text-sm text-gray-500 text-center">
                Assurez-vous d'avoir entré le numéro dans {serviceName}, puis réessayez. Le code arrive parfois quelques secondes après.
              </p>
              <button
                onClick={restart}
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
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const handleRefund = async (subscriptionId: string) => {
    if (!user) return;
    setRefundingId(subscriptionId);
    try {
      const { data, error } = await supabase.functions.invoke("refund-number", {
        body: { user_id: user.id, subscription_id: subscriptionId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Remboursement échoué");
      toast.success(`${data.refunded_coins} Coins recrédités sur votre solde`);
      refetch();
    } catch (err: any) {
      toast.error(err.message ?? "Impossible de rembourser ce numéro");
    } finally {
      setRefundingId(null);
    }
  };

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
    