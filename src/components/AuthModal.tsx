import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Phone, Loader2, ChevronDown, Search, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithGoogle, sendPhoneOTP, auth, RecaptchaVerifier, type ConfirmationResult } from "@/lib/firebase";
import { toast } from "sonner";

// ─── Country Codes ────────────────────────────────────────────────────────────
interface Country {
  name: string;
  dial: string;
  code: string;
  flag: string;
}

const COUNTRIES: Country[] = [
  { name: "Bénin",              dial: "+229", code: "BJ", flag: "🇧🇯" },
  { name: "Côte d'Ivoire",      dial: "+225", code: "CI", flag: "🇨🇮" },
  { name: "Sénégal",            dial: "+221", code: "SN", flag: "🇸🇳" },
  { name: "Mali",               dial: "+223", code: "ML", flag: "🇲🇱" },
  { name: "Burkina Faso",       dial: "+226", code: "BF", flag: "🇧🇫" },
  { name: "Togo",               dial: "+228", code: "TG", flag: "🇹🇬" },
  { name: "Niger",              dial: "+227", code: "NE", flag: "🇳🇪" },
  { name: "Guinée",             dial: "+224", code: "GN", flag: "🇬🇳" },
  { name: "Cameroun",           dial: "+237", code: "CM", flag: "🇨🇲" },
  { name: "Congo RDC",          dial: "+243", code: "CD", flag: "🇨🇩" },
  { name: "Nigeria",            dial: "+234", code: "NG", flag: "🇳🇬" },
  { name: "Ghana",              dial: "+233", code: "GH", flag: "🇬🇭" },
  { name: "Maroc",              dial: "+212", code: "MA", flag: "🇲🇦" },
  { name: "Algérie",            dial: "+213", code: "DZ", flag: "🇩🇿" },
  { name: "Tunisie",            dial: "+216", code: "TN", flag: "🇹🇳" },
  { name: "Madagascar",         dial: "+261", code: "MG", flag: "🇲🇬" },
  { name: "France",             dial: "+33",  code: "FR", flag: "🇫🇷" },
  { name: "Belgique",           dial: "+32",  code: "BE", flag: "🇧🇪" },
  { name: "Suisse",             dial: "+41",  code: "CH", flag: "🇨🇭" },
  { name: "Canada",             dial: "+1",   code: "CA", flag: "🇨🇦" },
  { name: "États-Unis",         dial: "+1",   code: "US", flag: "🇺🇸" },
  { name: "Royaume-Uni",        dial: "+44",  code: "GB", flag: "🇬🇧" },
  { name: "Allemagne",          dial: "+49",  code: "DE", flag: "🇩🇪" },
  { name: "Espagne",            dial: "+34",  code: "ES", flag: "🇪🇸" },
  { name: "Italie",             dial: "+39",  code: "IT", flag: "🇮🇹" },
  { name: "Portugal",           dial: "+351", code: "PT", flag: "🇵🇹" },
  { name: "Brésil",             dial: "+55",  code: "BR", flag: "🇧🇷" },
  { name: "Inde",               dial: "+91",  code: "IN", flag: "🇮🇳" },
  { name: "Chine",              dial: "+86",  code: "CN", flag: "🇨🇳" },
  { name: "Japon",              dial: "+81",  code: "JP", flag: "🇯🇵" },
  { name: "Australie",          dial: "+61",  code: "AU", flag: "🇦🇺" },
  { name: "Afrique du Sud",     dial: "+27",  code: "ZA", flag: "🇿🇦" },
  { name: "Égypte",             dial: "+20",  code: "EG", flag: "🇪🇬" },
  { name: "Éthiopie",           dial: "+251", code: "ET", flag: "🇪🇹" },
  { name: "Kenya",              dial: "+254", code: "KE", flag: "🇰🇪" },
  { name: "Tanzanie",           dial: "+255", code: "TZ", flag: "🇹🇿" },
  { name: "Rwanda",             dial: "+250", code: "RW", flag: "🇷🇼" },
  { name: "Mozambique",         dial: "+258", code: "MZ", flag: "🇲🇿" },
  { name: "Angola",             dial: "+244", code: "AO", flag: "🇦🇴" },
  { name: "Gabon",              dial: "+241", code: "GA", flag: "🇬🇦" },
  { name: "Guinée Équatoriale", dial: "+240", code: "GQ", flag: "🇬🇶" },
  { name: "Mauritanie",         dial: "+222", code: "MR", flag: "🇲🇷" },
  { name: "Cap-Vert",           dial: "+238", code: "CV", flag: "🇨🇻" },
  { name: "Comores",            dial: "+269", code: "KM", flag: "🇰🇲" },
  { name: "Mexique",            dial: "+52",  code: "MX", flag: "🇲🇽" },
  { name: "Argentine",          dial: "+54",  code: "AR", flag: "🇦🇷" },
  { name: "Russie",             dial: "+7",   code: "RU", flag: "🇷🇺" },
  { name: "Turquie",            dial: "+90",  code: "TR", flag: "🇹🇷" },
  { name: "Arabie Saoudite",    dial: "+966", code: "SA", flag: "🇸🇦" },
  { name: "Émirats Arabes",     dial: "+971", code: "AE", flag: "🇦🇪" },
];

type Step = "menu" | "phone" | "otp";

interface AuthModalProps {
  open: boolean;
  message?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({ open, message, onClose, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState<Step>("menu");
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingPhone, setLoadingPhone] = useState(false);
  const [loadingOtp, setLoadingOtp] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Auto-detect country from IP
  useEffect(() => {
    if (!open) return;
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((data) => {
        const found = COUNTRIES.find((c) => c.code === data.country_code);
        if (found) setCountry(found);
      })
      .catch(() => {});
  }, [open]);

  // Nettoie complètement le reCAPTCHA (verifier + DOM)
  const clearRecaptcha = useCallback(() => {
    if (recaptchaVerifierRef.current) {
      try { recaptchaVerifierRef.current.clear(); } catch { /* ignore */ }
      recaptchaVerifierRef.current = null;
    }
    if (recaptchaRef.current) {
      recaptchaRef.current.innerHTML = "";
    }
  }, []);

  // Nettoyage à la destruction du composant
  useEffect(() => {
    return () => { clearRecaptcha(); };
  }, [clearRecaptcha]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("menu");
        setPhone("");
        setOtp("");
        setSearch("");
        setShowPicker(false);
        setConfirmation(null);
        clearRecaptcha();
      }, 300);
    }
  }, [open, clearRecaptcha]);

  const setupRecaptcha = useCallback(() => {
    if (!recaptchaRef.current) return;
    clearRecaptcha();
    recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current, {
      size: "invisible",
    });
  }, [clearRecaptcha]);

  const handleGoogle = async () => {
    setLoadingGoogle(true);
    try {
      await signInWithGoogle();
      toast.success("Connecté avec Google !");
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur Google";
      if (!msg.includes("popup-closed")) toast.error(msg);
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleSendOTP = async () => {
    if (!phone.trim() || phone.length < 6) {
      toast.error("Numéro de téléphone invalide");
      return;
    }
    setLoadingPhone(true);
    try {
      setupRecaptcha();
      const fullPhone = country.dial + phone.replace(/^0/, "");
      const result = await sendPhoneOTP(fullPhone, recaptchaVerifierRef.current!);
      setConfirmation(result);
      setStep("otp");
      toast.success(`Code envoyé au ${fullPhone}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur d'envoi";
      toast.error(msg);
      clearRecaptcha();
    } finally {
      setLoadingPhone(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      toast.error("Entrez le code à 6 chiffres");
      return;
    }
    setLoadingOtp(true);
    try {
      await confirmation!.confirm(otp);
      toast.success("Connexion réussie !");
      onSuccess();
      onClose();
    } catch {
      toast.error("Code incorrect. Vérifiez et réessayez.");
    } finally {
      setLoadingOtp(false);
    }
  };

  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dial.includes(search)
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md rounded-t-3xl bg-card shadow-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
          >
            <div className="p-6">
              {/* Header */}
              <div className="mb-5 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {step !== "menu" && (
                    <button
                      onClick={() => {
                        if (step === "otp") { clearRecaptcha(); setStep("phone"); }
                        else setStep("menu");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      {step === "menu" && "Se connecter"}
                      {step === "phone" && "Connexion par SMS"}
                      {step === "otp" && "Vérification"}
                    </h2>
                    {step === "menu" && message && (
                      <p className="text-xs text-muted-foreground mt-0.5">{message}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <AnimatePresence mode="wait">

                {/* ── STEP 1: Menu ── */}
                {step === "menu" && (
                  <motion.div
                    key="menu"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    className="space-y-3"
                  >
                    {/* Google Button */}
                    <Button
                      onClick={handleGoogle}
                      disabled={loadingGoogle}
                      className="relative h-14 w-full rounded-2xl border-2 border-border bg-card text-foreground shadow-sm hover:bg-muted/50 font-semibold text-sm"
                      variant="outline"
                    >
                      {loadingGoogle ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                          Continuer avec Google
                        </>
                      )}
                    </Button>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-medium text-muted-foreground">ou</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    {/* Phone Button */}
                    <Button
                      onClick={() => setStep("phone")}
                      className="h-14 w-full rounded-2xl gradient-primary text-primary-foreground font-semibold shadow-glow"
                    >
                      <Phone className="h-5 w-5 mr-3" />
                      Continuer par SMS
                    </Button>

                    <p className="text-center text-xs text-muted-foreground pt-1">
                      En continuant, vous acceptez nos conditions d'utilisation.
                    </p>
                  </motion.div>
                )}

                {/* ── STEP 2: Phone ── */}
                {step === "phone" && (
                  <motion.div
                    key="phone"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    className="space-y-4"
                  >
                    <p className="text-sm text-muted-foreground">
                      Entrez votre numéro. Nous vous enverrons un code de vérification.
                    </p>

                    {/* Country + Phone input */}
                    <div className="flex gap-2">
                      {/* Country Picker Button */}
                      <button
                        type="button"
                        onClick={() => setShowPicker(!showPicker)}
                        className="flex items-center gap-1.5 rounded-xl border border-input bg-muted/50 px-3 py-2 text-sm font-medium whitespace-nowrap hover:bg-muted transition-colors"
                      >
                        <span className="text-lg">{country.flag}</span>
                        <span>{country.dial}</span>
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showPicker ? "rotate-180" : ""}`} />
                      </button>

                      <Input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="Numéro de téléphone"
                        className="h-11 flex-1 rounded-xl"
                        maxLength={15}
                      />
                    </div>

                    {/* Country Picker Dropdown */}
                    <AnimatePresence>
                      {showPicker && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden"
                        >
                          <div className="p-2 border-b border-border">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <input
                                autoFocus
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Rechercher un pays..."
                                className="w-full rounded-xl bg-muted/50 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
                              />
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filtered.map((c) => (
                              <button
                                key={c.code}
                                type="button"
                                onClick={() => {
                                  setCountry(c);
                                  setShowPicker(false);
                                  setSearch("");
                                }}
                                className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors ${country.code === c.code ? "bg-primary/5 text-primary font-semibold" : "text-foreground"}`}
                              >
                                <span className="text-lg">{c.flag}</span>
                                <span className="flex-1 text-left">{c.name}</span>
                                <span className="text-muted-foreground">{c.dial}</span>
                              </button>
                            ))}
                            {filtered.length === 0 && (
                              <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div ref={recaptchaRef} />

                    <Button
                      onClick={handleSendOTP}
                      disabled={loadingPhone || phone.length < 6}
                      className="h-13 w-full rounded-2xl gradient-primary text-primary-foreground font-semibold shadow-glow"
                    >
                      {loadingPhone ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        "Envoyer le code"
                      )}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground">
                      Disponible dans tous les pays • Gratuit pour vous
                    </p>
                  </motion.div>
                )}

                {/* ── STEP 3: OTP ── */}
                {step === "otp" && (
                  <motion.div
                    key="otp"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    className="space-y-5"
                  >
                    <div className="rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3 text-center">
                      <Mail className="h-5 w-5 text-primary mx-auto mb-1" />
                      <p className="text-sm text-foreground font-medium">
                        Code envoyé au
                      </p>
                      <p className="text-sm font-bold text-primary">
                        {country.flag} {country.dial} {phone}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Code à 6 chiffres
                      </label>
                      <Input
                        type="number"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.slice(0, 6))}
                        placeholder="_ _ _ _ _ _"
                        className="h-14 rounded-xl text-3xl font-bold tracking-[0.5em] text-center"
                        maxLength={6}
                        autoFocus
                      />
                    </div>

                    <Button
                      onClick={handleVerifyOTP}
                      disabled={loadingOtp || otp.length !== 6}
                      className="h-13 w-full rounded-2xl gradient-primary text-primary-foreground font-semibold shadow-glow"
                    >
                      {loadingOtp ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        "Vérifier et se connecter"
                      )}
                    </Button>

                    <button
                      type="button"
                      onClick={() => { clearRecaptcha(); setStep("phone"); setOtp(""); }}
                      className="w-full text-center text-sm text-primary hover:underline"
                    >
                      Renvoyer le code
                    </button>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
