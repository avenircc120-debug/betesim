import { useEffect, useState } from "react";
import {
  Bell,
  Menu,
  Check,
  LogIn,
  Zap,
  Loader2,
  X,
  FlaskConical,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import DrawerMenu from "@/components/DrawerMenu";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

type Pack = {
  coins: number;
  fcfa: number;
  badge?: string;
  badgeColor?: string;
  discount?: number;
};

type PaymentOperator = {
  label: string;
  mode: string;
  color: string;
  isTest?: boolean;
};

type PaymentCountry = {
  code: string;
  flag: string;
  dialCode: string;
  name: string;
  phonePlaceholder: string;
  operators: PaymentOperator[];
};

const PAYMENT_COUNTRIES: PaymentCountry[] = [
  {
    code: "bj",
    flag: "🇧🇯",
    dialCode: "229",
    name: "Bénin",
    phonePlaceholder: "01XXXXXXXX",
    operators: [
      { label: "MTN", mode: "mtn_open", color: "#FFD700" },
      { label: "MOOV", mode: "moov", color: "#FF6B1A" },
      { label: "CELTIIS", mode: "sbin", color: "#4A90D9" },
      { label: "Momo Test", mode: "momo_test", color: "#6366F1", isTest: true },
    ],
  },
  {
    code: "tg",
    flag: "🇹🇬",
    dialCode: "228",
    name: "Togo",
    phonePlaceholder: "90123456",
    operators: [
      { label: "MOOV", mode: "moov_tg", color: "#FF6B1A" },
      { label: "Togocom", mode: "togocel", color: "#0070C0" },
      { label: "Momo Test", mode: "momo_test", color: "#6366F1", isTest: true },
    ],
  },
  {
    code: "ci",
    flag: "🇨🇮",
    dialCode: "225",
    name: "Côte d’Ivoire",
    phonePlaceholder: "0712345678",
    operators: [
      { label: "MTN", mode: "mtn_ci", color: "#FFD700" },
      { label: "Momo Test", mode: "momo_test", color: "#6366F1", isTest: true },
    ],
  },
  {
    code: "ne",
    flag: "🇳🇪",
    dialCode: "227",
    name: "Niger",
    phonePlaceholder: "96123456",
    operators: [
      { label: "Airtel", mode: "airtel_ne", color: "#E53935" },
      { label: "Momo Test", mode: "momo_test", color: "#6366F1", isTest: true },
    ],
  },
  {
    code: "sn",
    flag: "🇸🇳",
    dialCode: "221",
    name: "Sénégal",
    phonePlaceholder: "771234567",
    operators: [
      { label: "Free", mode: "free_sn", color: "#E53935" },
      { label: "Momo Test", mode: "momo_test", color: "#6366F1", isTest: true },
    ],
  },
  {
    code: "gn",
    flag: "🇬🇳",
    dialCode: "224",
    name: "Guinée",
    phonePlaceholder: "621234567",
    operators: [
      { label: "MTN", mode: "mtn_open_gn", color: "#FFD700" },
      { label: "Momo Test", mode: "momo_test", color: "#6366F1", isTest: true },
    ],
  },
];

const PACKS: Pack[] = [
  {
    coins: 10,
    fcfa: 1_000,
    badge: "Découverte",
    badgeColor: "bg-gray-200 text-gray-600",
  },
  { coins: 20, fcfa: 2_000 },
  { coins: 35, fcfa: 3_000, discount: 14 },
  { coins: 46, fcfa: 4_000, discount: 14 },
  {
    coins: 58,
    fcfa: 5_000,
    discount: 14,
    badge: "POPULAIRE",
    badgeColor: "bg-orange-500 text-white",
  },
  {
    coins: 118,
    fcfa: 10_000,
    discount: 15,
    badge: "Top",
    badgeColor: "bg-orange-100 text-orange-600",
  },
  { coins: 180, fcfa: 15_000, discount: 17 },
  { coins: 250, fcfa: 20_000, discount: 20 },
  { coins: 650, fcfa: 50_000, discount: 23 },
  {
    coins: 1450,
    fcfa: 100_000,
    discount: 31,
    badge: "Meilleur prix",
    badgeColor: "bg-green-100 text-green-700",
  },
];

const WalletPage = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Pack>(PACKS[4]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [operator, setOperator] = useState("momo_test");
  const [country, setCountry] = useState("bj");
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber ?? "");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentState, setPaymentState] = useState<
    "form" | "pending" | "success" | "failed"
  >("form");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const selectedCountry =
    PAYMENT_COUNTRIES.find((item) => item.code === country) ??
    PAYMENT_COUNTRIES[0];

  useEffect(() => {
    if (user?.phoneNumber && !phoneNumber) setPhoneNumber(user.phoneNumber);
  }, [user?.phoneNumber, phoneNumber]);

  const handleBuy = () => {
    if (!user) {
      navigate("/login", { state: { from: "/recharger" } });
      return;
    }
    setPaymentError("");
    setPaymentState("form");
    setPaymentOpen(true);
  };

  const closePayment = () => {
    if (paymentState === "pending") return;
    setPaymentOpen(false);
    setOrderId(null);
  };

  const startPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setPaymentError("");
    setPaymentState("pending");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Votre session a expiré. Reconnectez-vous.");
      const response = await fetch("/api/chap-money/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          coins: selected.coins,
          country,
          operator,
          phoneNumber: phoneNumber
            .replace(/\D/g, "")
            .replace(new RegExp(`^${selectedCountry.dialCode}`), ""),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Impossible de démarrer le paiement.");
      setOrderId(result.orderId);
      pollPayment(result.orderId, token);
    } catch (error: unknown) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "Impossible de démarrer le paiement.",
      );
      setPaymentState("failed");
    }
  };

  const pollPayment = (id: string, token: string) => {
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/chap-money/status/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error ?? "Impossible de vérifier le paiement.",
          );
        if (result.status === "completed") {
          await queryClient.invalidateQueries({
            queryKey: ["profile", user?.id],
          });
          setPaymentState("success");
          return;
        }
        if (result.status === "failed" || result.status === "canceled") {
          setPaymentError(
            "Le paiement n’a pas été validé. Aucun coin n’a été ajouté.",
          );
          setPaymentState("failed");
          return;
        }
        if (attempts < 30) window.setTimeout(poll, 4000);
        else {
          setPaymentError(
            "Le paiement est toujours en attente. Vous pouvez fermer cette fenêtre et consulter votre solde plus tard.",
          );
          setPaymentState("failed");
        }
      } catch (error: unknown) {
        setPaymentError(
          error instanceof Error
            ? error.message
            : "Impossible de vérifier le paiement.",
        );
        setPaymentState("failed");
      }
    };
    void poll();
  };

  const fmt = (n: number) =>
    n >= 1_000 ? `${(n / 1_000).toLocaleString("fr-FR")}k` : String(n);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setDrawerOpen(true)} className="text-gray-700">
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Rechargeur</h1>
        </div>
        <div className="flex items-center gap-3">
          {loading ? null : user ? (
            <button className="flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1.5">
              <span className="text-base">🪙</span>
              <span className="text-sm font-semibold text-orange-500">
                {profile?.coin_balance?.toLocaleString("fr-FR") ?? "0"} Coins
              </span>
            </button>
          ) : (
            <button
              onClick={() =>
                navigate("/login", { state: { from: "/recharger" } })
              }
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

      <div className="px-4 pt-4 pb-4 flex flex-col gap-3">
        <p className="text-xs font-bold tracking-widest text-gray-400 text-center">
          CHOISIR UN MONTANT
        </p>

        {/* Grille compacte 3 colonnes */}
        <div className="grid grid-cols-3 gap-2">
          {PACKS.map((pack) => {
            const isSelected = selected.coins === pack.coins;
            const isLast = pack.fcfa === 100_000;
            return (
              <motion.button
                key={pack.coins}
                whileTap={{ scale: 0.94 }}
                onClick={() => setSelected(pack)}
                className={`relative rounded-xl border-2 bg-white p-2.5 text-left transition-all ${
                  isSelected
                    ? "border-orange-500 bg-orange-50 shadow-md"
                    : "border-gray-200 shadow-sm"
                } ${isLast ? "col-span-3" : ""}`}
              >
                {pack.badge && (
                  <span
                    className={`absolute -top-2 left-2 rounded-full px-2 py-px text-[9px] font-bold leading-tight ${pack.badgeColor}`}
                  >
                    {pack.badge}
                  </span>
                )}
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </span>
                )}
                <div className="flex items-baseline gap-0.5 mt-1">
                  <span
                    className={`font-bold text-gray-900 leading-none ${isLast ? "text-2xl" : "text-xl"}`}
                  >
                    {pack.coins}
                  </span>
                  <span className="text-sm leading-none">🪙</span>
                </div>
                <p className="text-[11px] font-semibold text-gray-500 mt-1 leading-tight">
                  {isLast
                    ? pack.fcfa.toLocaleString("fr-FR") + " F"
                    : fmt(pack.fcfa) + " F"}
                </p>
                {pack.discount && (
                  <p className="text-[10px] font-bold text-green-600 mt-0.5">
                    -{pack.discount}%
                  </p>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Bouton juste sous la grille */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleBuy}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-base font-bold text-white shadow-lg"
        >
          <Zap className="h-5 w-5" />
          {loading
            ? "Chargement…"
            : user
              ? `Acheter · ${selected.coins} Coins`
              : `Se connecter · ${selected.coins} Coins`}
        </motion.button>
      </div>

      {paymentOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
                  Chap Money
                </p>
                <h2 className="text-xl font-bold text-gray-900">
                  Acheter {selected.coins} Coins
                </h2>
              </div>
              {paymentState !== "pending" && (
                <button
                  onClick={closePayment}
                  aria-label="Fermer"
                  className="rounded-full bg-gray-100 p-2 text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {paymentState === "form" && (
              <form onSubmit={startPayment} className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    1. Choisissez votre pays
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_COUNTRIES.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          setCountry(item.code);
                          setOperator("momo_test");
                          setPhoneNumber("");
                        }}
                        className={`flex flex-col items-center justify-center rounded-xl border p-2 transition ${
                          country === item.code
                            ? "border-orange-500 bg-orange-50 ring-1 ring-orange-500"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <span className="text-xl">{item.flag}</span>
                        <span className="text-[10px] font-bold uppercase text-gray-700">
                          {item.code}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          +{item.dialCode}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    2. Sélectionnez l’opération
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedCountry.operators.map((item) => (
                      <button
                        key={item.mode}
                        type="button"
                        onClick={() => setOperator(item.mode)}
                        style={{
                          borderColor:
                            operator === item.mode ? item.color : undefined,
                          backgroundColor:
                            operator === item.mode
                              ? `${item.color}18`
                              : undefined,
                        }}
                        className={`flex min-h-14 items-center justify-center gap-1.5 rounded-xl border px-2 text-center text-sm font-bold transition ${
                          operator === item.mode
                            ? "ring-2 ring-orange-200"
                            : item.isTest
                              ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {item.isTest && <FlaskConical className="h-4 w-4" />}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block text-sm font-semibold text-gray-700">
                  3. Numéro Mobile Money
                  <div className="mt-1.5 flex overflow-hidden rounded-xl border border-gray-200 focus-within:border-orange-500">
                    <span className="flex items-center border-r border-gray-200 bg-gray-100 px-3 text-sm font-semibold text-gray-700">
                      {selectedCountry.flag} +{selectedCountry.dialCode}
                    </span>
                    <input
                      value={phoneNumber}
                      onChange={(e) =>
                        setPhoneNumber(e.target.value.replace(/[^\d\s]/g, ""))
                      }
                      inputMode="tel"
                      placeholder={selectedCountry.phonePlaceholder}
                      required
                      className="min-w-0 flex-1 px-3 py-3 font-normal outline-none"
                    />
                  </div>
                </label>
                {paymentError && (
                  <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                    {paymentError}
                  </p>
                )}
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 font-bold text-white"
                >
                  <Zap className="h-5 w-5" /> Payer{" "}
                  {selected.fcfa.toLocaleString("fr-FR")} FCFA
                </button>
              </form>
            )}

            {paymentState === "pending" && (
              <div className="py-8 text-center">
                <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-orange-500" />
                <h3 className="text-lg font-bold text-gray-900">
                  Validation en attente
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Validez la demande sur votre téléphone. Nous ajouterons vos
                  Coins automatiquement après confirmation.
                </p>
              </div>
            )}

            {paymentState === "success" && (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
                  ✓
                </div>
                <h3 className="text-lg font-bold text-gray-900">
                  Recharge confirmée
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  {selected.coins} Coins ont été ajoutés à votre solde.
                </p>
                <button
                  onClick={closePayment}
                  className="mt-6 w-full rounded-2xl bg-orange-500 py-3.5 font-bold text-white"
                >
                  Fermer
                </button>
              </div>
            )}

            {paymentState === "failed" && (
              <div className="py-5 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
                  !
                </div>
                <p className="text-sm leading-6 text-gray-600">
                  {paymentError}
                </p>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={closePayment}
                    className="flex-1 rounded-2xl border border-gray-200 py-3.5 font-bold text-gray-700"
                  >
                    Fermer
                  </button>
                  <button
                    onClick={() => {
                      setPaymentState("form");
                      setPaymentError("");
                    }}
                    className="flex-1 rounded-2xl bg-orange-500 py-3.5 font-bold text-white"
                  >
                    Réessayer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <BottomNav />
    </div>
  );
};

export default WalletPage;
