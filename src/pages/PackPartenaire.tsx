import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Check, Copy, ExternalLink, Loader2, MessageCircle,
  ShieldCheck, Lock, Unlock, Sparkles, ChevronDown, Globe,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { createFedaPayTransaction } from "@/lib/fedapay";

type PackStatus = "paid" | "partner_id_provided" | "delivered";

interface PartnerPack {
  id: string;
  user_id: string;
  status: PackStatus;
  partner_id: string | null;
  telegram_number: string | null;
  subscription_id: string | null;
  fedapay_transaction_id: string | null;
  created_at: string;
}

const COUNTRY_DIAL: Record<string, string> = {
  AF: "+93",   AL: "+355",  DZ: "+213",  AS: "+1684", AD: "+376",  AO: "+244",
  AI: "+1264", AG: "+1268", AR: "+54",   AM: "+374",  AW: "+297",  AU: "+61",
  AT: "+43",   AZ: "+994",  BS: "+1242", BH: "+973",  BD: "+880",  BB: "+1246",
  BY: "+375",  BE: "+32",   BZ: "+501",  BJ: "+229",  BM: "+1441", BT: "+975",
  BO: "+591",  BA: "+387",  BW: "+267",  BR: "+55",   IO: "+246",  VG: "+1284",
  BN: "+673",  BG: "+359",  BF: "+226",  BI: "+257",  KH: "+855",  CM: "+237",
  CA: "+1",    CV: "+238",  KY: "+1345", CF: "+236",  TD: "+235",  CL: "+56",
  CN: "+86",   CX: "+61",   CC: "+61",   CO: "+57",   KM: "+269",  CK: "+682",
  CR: "+506",  HR: "+385",  CU: "+53",   CW: "+599",  CY: "+357",  CZ: "+420",
  CD: "+243",  DK: "+45",   DJ: "+253",  DM: "+1767", DO: "+1809", EC: "+593",
  EG: "+20",   SV: "+503",  GQ: "+240",  ER: "+291",  EE: "+372",  SZ: "+268",
  ET: "+251",  FK: "+500",  FO: "+298",  FJ: "+679",  FI: "+358",  FR: "+33",
  GF: "+594",  PF: "+689",  GA: "+241",  GM: "+220",  GE: "+995",  DE: "+49",
  GH: "+233",  GI: "+350",  GR: "+30",   GL: "+299",  GD: "+1473", GP: "+590",
  GU: "+1671", GT: "+502",  GG: "+44",   GN: "+224",  GW: "+245",  GY: "+592",
  HT: "+509",  HN: "+504",  HK: "+852",  HU: "+36",   IS: "+354",  IN: "+91",
  ID: "+62",   IR: "+98",   IQ: "+964",  IE: "+353",  IM: "+44",   IL: "+972",
  IT: "+39",   CI: "+225",  JM: "+1876", JP: "+81",   JE: "+44",   JO: "+962",
  KZ: "+7",    KE: "+254",  KI: "+686",  XK: "+383",  KW: "+965",  KG: "+996",
  LA: "+856",  LV: "+371",  LB: "+961",  LS: "+266",  LR: "+231",  LY: "+218",
  LI: "+423",  LT: "+370",  LU: "+352",  MO: "+853",  MG: "+261",  MW: "+265",
  MY: "+60",   MV: "+960",  ML: "+223",  MT: "+356",  MH: "+692",  MQ: "+596",
  MR: "+222",  MU: "+230",  YT: "+262",  MX: "+52",   FM: "+691",  MD: "+373",
  MC: "+377",  MN: "+976",  ME: "+382",  MS: "+1664", MA: "+212",  MZ: "+258",
  MM: "+95",   NA: "+264",  NR: "+674",  NP: "+977",  NL: "+31",   NC: "+687",
  NZ: "+64",   NI: "+505",  NE: "+227",  NG: "+234",  NU: "+683",  NF: "+672",
  KP: "+850",  MK: "+389",  MP: "+1670", NO: "+47",   OM: "+968",  PK: "+92",
  PW: "+680",  PS: "+970",  PA: "+507",  PG: "+675",  PY: "+595",  PE: "+51",
  PH: "+63",   PN: "+64",   PL: "+48",   PT: "+351",  PR: "+1787", QA: "+974",
  CG: "+242",  RE: "+262",  RO: "+40",   RU: "+7",    RW: "+250",  BL: "+590",
  SH: "+290",  KN: "+1869", LC: "+1758", MF: "+590",  PM: "+508",  VC: "+1784",
  WS: "+685",  SM: "+378",  ST: "+239",  SA: "+966",  SN: "+221",  RS: "+381",
  SC: "+248",  SL: "+232",  SG: "+65",   SX: "+1721", SK: "+421",  SI: "+386",
  SB: "+677",  SO: "+252",  ZA: "+27",   KR: "+82",   SS: "+211",  ES: "+34",
  LK: "+94",   SD: "+249",  SR: "+597",  SJ: "+47",   SE: "+46",   CH: "+41",
  SY: "+963",  TW: "+886",  TJ: "+992",  TZ: "+255",  TH: "+66",   TL: "+670",
  TG: "+228",  TK: "+690",  TO: "+676",  TT: "+1868", TN: "+216",  TR: "+90",
  TM: "+993",  TC: "+1649", TV: "+688",  VI: "+1340", UG: "+256",  UA: "+380",
  AE: "+971",  GB: "+44",   US: "+1",    UY: "+598",  UZ: "+998",  VU: "+678",
  VA: "+39",   VE: "+58",   VN: "+84",   WF: "+681",  EH: "+212",  YE: "+967",
  ZM: "+260",  ZW: "+263",
};

const COUNTRY_TEASE: Record<string, string> = {
  FR: "6 45", BE: "4 78", LU: "6 21", MC: "6 12", CH: "7 8",  AT: "6 64",
  DE: "1 51", NL: "6 12", IE: "8 7",  GB: "7 70", IM: "7 8",  GG: "7 8",  JE: "7 8",
  ES: "6 12", PT: "9 12", IT: "3 47", VA: "3 47", SM: "6 6",  AD: "3 12", GI: "5 4",
  GR: "6 9",  CY: "9 6",  MT: "7 9",
  SE: "7 0",  NO: "9 12", DK: "2 12", FI: "4 0",  IS: "6 1",  FO: "2 1",
  PL: "5 12", CZ: "6 0",  SK: "9 0",  HU: "30 7", RO: "7 21", BG: "8 7",
  HR: "9 1",  SI: "4 0",  RS: "6 0",  BA: "6 1",  ME: "6 7",  MK: "7 0",
  AL: "6 8",  XK: "4 4",  MD: "6 0",
  RU: "9 12", BY: "29 7", UA: "9 7",
  EE: "5 0",  LV: "2 0",  LT: "6 0",  LI: "7 8",
  US: "415 22", CA: "514 22",
  MX: "55 1",   GT: "5 5",  BZ: "6 2",  SV: "7 0",  HN: "9 8",  NI: "8 5",
  CR: "8 3",    PA: "6 1",  CU: "5 2",  HT: "3 4",  DO: "8 09", PR: "787 5",
  JM: "876 5",  BS: "242 4", BB: "246 2", TT: "868 7",
  BR: "11 9",   AR: "9 11", CL: "9 7",  CO: "3 0",  PE: "9 7",  VE: "4 12",
  EC: "9 8",    BO: "7 5",  PY: "9 8",  UY: "9 8",  GY: "6 0",  SR: "8 8",
  GF: "6 94",   GP: "6 90", MQ: "6 96", BL: "6 90", MF: "6 90", PM: "508 4",
  CN: "1 38", JP: "9 0",  KR: "1 0",  KP: "1 9",  TW: "9 0",  HK: "5 1", MO: "6 6",
  IN: "9 87", PK: "3 0",  BD: "1 7",  LK: "7 1",  NP: "9 8",  BT: "1 7", MV: "7 7",
  AF: "7 0",  IR: "9 12", IQ: "7 7",  SY: "9 3",  LB: "7 1",  JO: "7 9",
  IL: "5 0",  PS: "5 9",  SA: "5 0",  AE: "5 0",  QA: "5 5",  BH: "3 6",
  KW: "5 0",  OM: "9 1",  YE: "7 7",  TR: "5 32",
  GE: "5 5",  AM: "9 4",  AZ: "5 0",  KZ: "7 1",  UZ: "9 0",  KG: "5 5",
  TJ: "9 0",  TM: "6 5",
  TH: "8 1",  VN: "9 0",  LA: "2 0",  KH: "1 2",  MM: "9 5",  MY: "1 2",
  SG: "8 1",  BN: "7 1",  ID: "8 1",  PH: "9 17", TL: "7 5",  MN: "8 8",
  EG: "1 0",  LY: "9 1",  TN: "2 0",  DZ: "5 50", MA: "6 12", EH: "6 12",
  MR: "2 2",  SN: "7 7",  GM: "7 0",  ML: "7 6",  GN: "6 2",  GW: "5 5",
  CV: "9 9",  SL: "7 6",  LR: "7 7",  CI: "0 7",  BF: "7 0",  GH: "2 4",
  TG: "9 0",  BJ: "9 7",  NE: "9 0",  NG: "80 3", CM: "6 5",  TD: "9 1",
  CF: "7 0",  GQ: "2 22", ST: "9 9",  GA: "0 7",  CG: "0 6",  CD: "8 1",
  AO: "9 2",  RW: "7 8",  BI: "7 9",  UG: "7 7",  KE: "7 1",  TZ: "7 4",
  DJ: "7 7",  SO: "6 1",  ER: "7 1",  ET: "9 1",  SS: "9 5",  SD: "9 1",
  KM: "3 2",  MG: "3 4",  RE: "6 92", YT: "6 39", MU: "5 9",  SC: "2 5",
  MZ: "8 2",  ZM: "9 7",  ZW: "7 7",  MW: "9 9",  BW: "7 1",  NA: "8 1",
  ZA: "8 2",  LS: "5 0",  SZ: "7 6",  SH: "5 1",
  AU: "4 12", NZ: "2 1",  FJ: "7 0",  PG: "7 0",  SB: "7 4",  VU: "5 9",
  NC: "8 8",  PF: "8 7",  WS: "7 5",  TO: "7 7",  CK: "5 0",
};

function maskedPreview(shortName?: string | null): string {
  const key = shortName ? shortName.toUpperCase() : null;
  if (!key) return "+•• ** ** ** ** **";
  const dial = COUNTRY_DIAL[key] || `+${key}`;
  const tease = COUNTRY_TEASE[key];
  return tease ? `${dial} ${tease} ** ** **` : `${dial} ** ** ** ** **`;
}

const PARTNER_COUNTRY_KEY = "pending_partner_country";

const PackPartenaire = () => {
  const { user, requireAuth, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const packId = searchParams.get("id");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedCountry, setSelectedCountry] = useState<string>("0");
  const [selectedCountryName, setSelectedCountryName] = useState<string>("N'importe quel pays");
  const [selectedCountryShort, setSelectedCountryShort] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [deliverAttempted, setDeliverAttempted] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) requireAuth(() => {});
  }, [authLoading, user, requireAuth]);

  const { data: catalogCountries = [], isLoading: loadingCountries } = useQuery({
    queryKey: ["winpack-countries"],
    queryFn: async () => {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/winpack-catalog?action=countries`,
        { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } }
      );
      const json = await resp.json();
      return json.success ? (json.data as { id: string; name: string; short_name: string }[]) : [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: pack, isLoading: loadingPack, refetch } = useQuery<PartnerPack | null>({
    queryKey: ["partner-pack", packId, user?.id],
    queryFn: async () => {
      if (!packId || !user) return null;
      const { data, error } = await supabase
        .from("partner_packs" as any)
        .select("*")
        .eq("id", packId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      if ((data as any).user_id !== user.id) throw new Error("Accès refusé");
      return data as any;
    },
    enabled: !!packId && !!user,
    refetchInterval: (q) => {
      const d = q.state.data as PartnerPack | null;
      return d && d.status !== "delivered" ? 6000 : false;
    },
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription", pack?.subscription_id],
    queryFn: async () => {
      if (!pack?.subscription_id) return null;
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("id", pack.subscription_id)
        .maybeSingle();
      return data;
    },
    enabled: !!pack?.subscription_id && pack?.status === "delivered",
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (!pack || !user || deliverAttempted) return;
    if (pack.status !== "delivered") {
      setDeliverAttempted(true);
      deliverNumber();
    }
  }, [pack?.id, pack?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePay = useCallback(async () => {
    if (!user) return;
    setIsPaying(true);
    try {
      sessionStorage.setItem("pending_product", "partner");
      sessionStorage.setItem("pending_service", "telegram");
      sessionStorage.setItem("pending_service_name", "Telegram");
      sessionStorage.setItem("pending_country", selectedCountry);
      sessionStorage.setItem(PARTNER_COUNTRY_KEY, selectedCountry);

      const result = await createFedaPayTransaction({
        amount: 2500,
        description: "Pack Partenaire WINPACK — Telegram",
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
  }, [user, selectedCountry]);

  const deliverNumber = async () => {
    if (!user || !pack) return;
    setDelivering(true);
    const country = sessionStorage.getItem(PARTNER_COUNTRY_KEY) || "0";
    try {
      const { data, error } = await supabase.functions.invoke("partner-pack", {
        body: { action: "deliver", user_id: user.id, pack_id: pack.id, country },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Livraison impossible");
      toast.success("Numéro Telegram livré !");
      sessionStorage.removeItem(PARTNER_COUNTRY_KEY);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["subscription", pack.subscription_id] });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la livraison");
    } finally {
      setDelivering(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copié`));
  };

  // ── PRÉ-PAIEMENT ───────────────────────────────────────────────────────────
  if (!packId) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="mx-auto max-w-lg space-y-5 px-4 pt-6">

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-2xl font-bold text-foreground">Pack Partenaire</h1>
            <p className="text-sm text-muted-foreground">Activation en 3 étapes</p>
          </motion.div>

          {/* Telegram verrouillé */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl bg-sky-500/10 border border-sky-400/40 p-4 flex items-center gap-3"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500">
              <span className="text-xl">✈️</span>
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">
                Configuration de votre compte Telegram Professionnel
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Obligatoire · Service inclus dans le pack</p>
            </div>
          </motion.div>

          {/* Choix du pays */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl bg-card p-5 shadow-card space-y-3"
          >
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-foreground">Choisissez votre pays</h2>
            </div>
            <div className="relative">
              <select
                value={selectedCountry}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCountry(id);
                  const found = catalogCountries.find((c) => c.id === id);
                  setSelectedCountryName(found?.name || "N'importe quel pays");
                  setSelectedCountryShort(found?.short_name || null);
                }}
                className="w-full h-12 rounded-xl border border-border bg-background px-3 pr-10 text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="0">N'importe quel pays</option>
                {catalogCountries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            {loadingCountries && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Chargement des pays…</span>
              </div>
            )}
          </motion.div>

          {/* Teaser — même design que Achat Direct */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
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
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500">
                    <span className="text-xl">✈️</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground truncate">
                      Telegram · {selectedCountryName}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-background/80 backdrop-blur p-4 border border-border relative">
                  <p className="text-2xl font-mono font-bold tracking-wider text-foreground/80 select-none">
                    {maskedPreview(selectedCountryShort)}
                  </p>
                  <div className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-400/40">
                    <Lock className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  🔒 Numéro <strong>verrouillé</strong>. Pour le débloquer et l'utiliser dans Telegram, validez le paiement ci-dessous.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Bouton paiement */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Button
              onClick={() => requireAuth(handlePay)}
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
                  <span>Débloquer mon numéro — 2 500 FCFA</span>
                </div>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-2">
              Paiement 100% sécurisé — FedaPay (Mobile Money, carte…)
            </p>
          </motion.div>

        </div>
        <BottomNav />
      </div>
    );
  }

  if (loadingPack || !pack) {
    return (
      <div className="min-h-screen bg-background pb-24 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <BottomNav />
      </div>
    );
  }

  // ── POST-PAIEMENT ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-6">

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Pack Partenaire</h1>
          <p className="text-sm text-muted-foreground">Configuration Telegram Professionnel</p>
        </motion.div>

        {/* Paiement confirmé */}
        <div className="rounded-2xl bg-accent/10 border border-accent/30 p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
            <Check className="h-5 w-5 text-accent-foreground" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">Paiement confirmé · 2 500 FCFA</p>
            <p className="text-[11px] text-muted-foreground">Pack Partenaire activé — livraison en cours</p>
          </div>
        </div>

        {/* Livraison en cours */}
        {pack.status !== "delivered" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-card p-5 shadow-card space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500">
                <span className="text-xl">✈️</span>
              </div>
              <div>
                <h2 className="font-bold text-foreground">Livraison de votre numéro Telegram</h2>
                <p className="text-xs text-muted-foreground">Allocation depuis SMSPool en cours…</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className={`h-4 w-4 text-primary ${delivering ? "animate-spin" : ""}`} />
              <span>{delivering ? "Allocation du numéro en cours…" : "Préparation en cours, veuillez patienter…"}</span>
            </div>
            {!delivering && (
              <Button
                onClick={deliverNumber}
                className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Allouer mon numéro maintenant
              </Button>
            )}
          </motion.div>
        )}

        {/* Révélation : vrai numéro + SMS + 1win */}
        {pack.status === "delivered" && pack.telegram_number && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/15 via-card to-primary/15 border-2 border-accent/40 p-5 shadow-glow"
            >
              <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-accent/15 blur-2xl" />
              <div className="relative space-y-4">
                <div className="flex items-center gap-2">
                  <Unlock className="h-4 w-4 text-accent" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
                    Votre vrai numéro
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500">
                    <span className="text-xl">✈️</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Telegram · Numéro débloqué</p>
                  </div>
                </div>

                <div className="rounded-xl bg-background p-4 border border-border">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    Numéro complet
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-mono font-bold text-foreground flex-1 break-all">
                      {pack.telegram_number}
                    </p>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(pack.telegram_number!, "Numéro")}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground hover:text-foreground border border-border"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="rounded-xl bg-background p-4 border border-border">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    Code de connexion SMS
                  </p>
                  {(subscription as any)?.last_sms_code ? (
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-mono font-bold text-accent tracking-widest flex-1">
                        {(subscription as any).last_sms_code}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard((subscription as any).last_sms_code, "Code")}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground hover:text-foreground border border-border"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">En attente du SMS… (jusqu'à 3 min)</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3">
                  <p className="text-xs text-amber-700 leading-relaxed">
                    <strong>Instructions :</strong> entrez ce numéro dans Telegram comme numéro de téléphone, puis saisissez le code SMS reçu ci-dessus. Le numéro est valide 30 jours.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* CTA 1win */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl bg-card p-5 shadow-card space-y-3 border border-primary/20"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                <h2 className="font-bold text-foreground">Inscription 1win</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Votre compte Telegram est prêt. Cliquez ci-dessous pour rejoindre 1win avec votre lien partenaire et commencer à générer des commissions.
              </p>
              <Button
                onClick={() => window.open("https://1w.run/?p=YvTH", "_blank", "noopener,noreferrer")}
                className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-bold shadow-glow"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                S'inscrire sur 1win
              </Button>
            </motion.div>

            <Button
              variant="outline"
              onClick={() => navigate("/historique")}
              className="h-11 w-full rounded-xl"
            >
              Voir mon historique
            </Button>
          </>
        )}

      </div>
      <BottomNav />
    </div>
  );
};

export default PackPartenaire;
