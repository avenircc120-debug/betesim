import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, CheckCircle, Wifi, AlertCircle, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Country {
  country: string;
  label: string;
  qty: number;
  price: number;
  flag: string;
}

interface EsimCountryPickerProps {
  service: "whatsapp" | "telegram";
  machineType: "pro" | "elite";
  userId: string;
  onDelivered: (phone: string) => void;
}

const SERVICE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

const SERVICE_COLORS: Record<string, string> = {
  whatsapp: "from-green-500 to-emerald-600",
  telegram: "from-sky-500 to-blue-600",
};

const EsimCountryPicker = ({ service, machineType, userId, onDelivered }: EsimCountryPickerProps) => {
  const [search, setSearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [step, setStep] = useState<"pick" | "confirm" | "loading" | "done" | "error">("pick");
  const [deliveredPhone, setDeliveredPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["esim-countries", service],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/esim-countries?service=${service}`,
        {
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur chargement pays");
      return json as { countries: Country[]; service: string };
    },
    staleTime: 60000, // 1 minute
  });

  const deliverMutation = useMutation({
    mutationFn: async (country: string) => {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deliver-esim`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
            "X-Internal-Secret": "", // sera validé côté serveur
          },
          body: JSON.stringify({
            user_id: userId,
            machine_type: machineType,
            service,
            country,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur livraison");
      return json;
    },
    onSuccess: (data) => {
      const delivery = data.deliveries?.find((d: any) => d.service === service);
      if (delivery?.phone) {
        setDeliveredPhone(delivery.phone);
        setStep("done");
        onDelivered(delivery.phone);
        queryClient.invalidateQueries({ queryKey: ["esim-deliveries"] });
      } else {
        setErrorMsg("Numéro non livré, réessayez ou contactez le support.");
        setStep("error");
      }
    },
    onError: (e: Error) => {
      setErrorMsg(e.message);
      setStep("error");
    },
  });

  const filtered = (data?.countries ?? []).filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase()) ||
    c.country.toLowerCase().includes(search.toLowerCase())
  );

  const handleConfirm = () => {
    if (!selectedCountry) return;
    setStep("loading");
    deliverMutation.mutate(selectedCountry.country);
  };

  const serviceLabel = SERVICE_LABELS[service];
  const gradient = SERVICE_COLORS[service];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`flex items-center gap-3 rounded-xl bg-gradient-to-r ${gradient} p-4`}>
        <Wifi className="h-6 w-6 text-white shrink-0" />
        <div>
          <p className="text-sm font-bold text-white">Numéro virtuel {serviceLabel}</p>
          <p className="text-xs text-white/80">Choisissez le pays du numéro</p>
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* STEP: pick country */}
        {step === "pick" && (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un pays…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-11 rounded-xl"
              />
            </div>

            {/* Country list */}
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Chargement des pays disponibles…</p>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <AlertCircle className="h-7 w-7 text-destructive" />
                <p className="text-sm text-muted-foreground">Impossible de charger les pays</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Réessayer
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun pays trouvé</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {filtered.map((c) => (
                  <button
                    key={c.country}
                    type="button"
                    onClick={() => setSelectedCountry(c)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
                      selectedCountry?.country === c.country
                        ? "bg-primary/10"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{c.flag}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{c.label}</p>
                        <p className="text-xs text-muted-foreground">{c.qty} numéro{c.qty > 1 ? "s" : ""} disponible{c.qty > 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    {selectedCountry?.country === c.country && (
                      <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            <Button
              onClick={() => { if (selectedCountry) setStep("confirm"); }}
              disabled={!selectedCountry || isLoading}
              className="h-12 w-full rounded-xl gradient-primary text-primary-foreground font-semibold shadow-glow disabled:opacity-50"
            >
              Continuer avec {selectedCountry ? `${selectedCountry.flag} ${selectedCountry.label}` : "un pays"}
            </Button>
          </motion.div>
        )}

        {/* STEP: confirm */}
        {step === "confirm" && selectedCountry && (
          <motion.div key="confirm" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Récapitulatif</p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Service</span>
                <span className="text-sm font-bold text-foreground">{serviceLabel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Pays du numéro</span>
                <span className="text-sm font-bold text-foreground">{selectedCountry.flag} {selectedCountry.label}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Disponibilité</span>
                <span className="text-sm font-semibold text-accent">{selectedCountry.qty} numéros</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Un numéro {serviceLabel} avec indicatif {selectedCountry.label} va être attribué à votre compte.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setStep("pick")} className="rounded-xl">
                ← Changer
              </Button>
              <Button
                onClick={handleConfirm}
                className={`rounded-xl bg-gradient-to-r ${gradient} text-white font-semibold shadow-md`}
              >
                Obtenir le numéro
              </Button>
            </div>
          </motion.div>
        )}

        {/* STEP: loading */}
        {step === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Attribution du numéro…</p>
              <p className="text-xs text-muted-foreground mt-1">Connexion à 5sim.net en cours</p>
            </div>
          </motion.div>
        )}

        {/* STEP: done */}
        {step === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-4 text-center"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
              <CheckCircle className="h-9 w-9 text-accent" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">Numéro {serviceLabel} livré !</p>
              <p className="mt-2 rounded-xl bg-muted px-4 py-2 text-xl font-bold text-foreground tracking-wide">
                {deliveredPhone}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Utilisez ce numéro pour créer votre compte {serviceLabel}.
                Gardez la page ouverte pour recevoir le code SMS.
              </p>
            </div>
          </motion.div>
        )}

        {/* STEP: error */}
        {step === "error" && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-4 text-center">
            <AlertCircle className="h-9 w-9 text-destructive" />
            <p className="text-sm font-semibold text-foreground">Échec de la livraison</p>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" size="sm" onClick={() => setStep("pick")} className="rounded-xl">
              Réessayer avec un autre pays
            </Button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
};

export default EsimCountryPicker;
