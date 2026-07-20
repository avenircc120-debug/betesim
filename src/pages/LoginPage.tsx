import { useState } from "react";
    import { Eye, EyeOff, ChevronDown, Loader2 } from "lucide-react";
    import { motion, AnimatePresence } from "framer-motion";
    import { useNavigate, useLocation } from "react-router-dom";
    import { useAuth } from "@/hooks/useAuth";
    import { supabase } from "@/integrations/supabase/client";
    import { toast } from "sonner";

    type Tab = "connexion" | "inscription";

    const COUNTRIES = [
    { name: "Bénin",          dial: "+229", flag: "🇧🇯" },
    { name: "Côte d'Ivoire",  dial: "+225", flag: "🇨🇮" },
    { name: "Sénégal",        dial: "+221", flag: "🇸🇳" },
    { name: "Mali",           dial: "+223", flag: "🇲🇱" },
    { name: "Burkina Faso",   dial: "+226", flag: "🇧🇫" },
    { name: "Togo",           dial: "+228", flag: "🇹🇬" },
    { name: "Niger",          dial: "+227", flag: "🇳🇪" },
    { name: "Guinée",         dial: "+224", flag: "🇬🇳" },
    { name: "Cameroun",       dial: "+237", flag: "🇨🇲" },
    { name: "Congo RDC",      dial: "+243", flag: "🇨🇩" },
    { name: "Nigeria",        dial: "+234", flag: "🇳🇬" },
    { name: "Ghana",          dial: "+233", flag: "🇬🇭" },
    { name: "Maroc",          dial: "+212", flag: "🇲🇦" },
    { name: "Algérie",        dial: "+213", flag: "🇩🇿" },
    { name: "Tunisie",        dial: "+216", flag: "🇹🇳" },
    { name: "Madagascar",     dial: "+261", flag: "🇲🇬" },
    { name: "France",         dial: "+33",  flag: "🇫🇷" },
    { name: "Belgique",       dial: "+32",  flag: "🇧🇪" },
    { name: "Canada",         dial: "+1",   flag: "🇨🇦" },
    { name: "États-Unis",     dial: "+1",   flag: "🇺🇸" },
    { name: "Royaume-Uni",    dial: "+44",  flag: "🇬🇧" },
    { name: "Allemagne",      dial: "+49",  flag: "🇩🇪" },
    { name: "Gabon",          dial: "+241", flag: "🇬🇦" },
    { name: "Mauritanie",     dial: "+222", flag: "🇲🇷" },
    { name: "Afrique du Sud", dial: "+27",  flag: "🇿🇦" },
    { name: "Kenya",          dial: "+254", flag: "🇰🇪" },
    ];

    const inputCls =
    "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

    const Field = ({ label, required = true, children }: {
    label: string; required?: boolean; children: React.ReactNode;
    }) => (
    <div>
      <label className="block text-sm font-semibold text-gray-800 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
    );

    /* ─────────────────────────────────────────
     Écran : Vérifiez votre boîte mail
    ───────────────────────────────────────── */
    const EmailVerificationScreen = ({ email, onBack }: { email: string; onBack: () => void }) => (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-4 mt-8 rounded-3xl bg-white shadow-lg p-8 flex flex-col items-center text-center gap-5"
    >
      {/* Icône enveloppe */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-100">
        <Mail className="h-10 w-10 text-orange-500" />
      </div>

      <div className="space-y-3">
        <h2 className="text-2xl font-extrabold text-gray-900">Vérifiez votre boîte mail</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Nous avons envoyé un lien de confirmation à{" "}
          <span className="font-semibold text-orange-500">{email}</span>.
          Veuillez cliquer sur ce lien pour activer votre compte Betesim.
        </p>
      </div>

      {/* Tip spam */}
      <div className="w-full rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          Si vous ne recevez rien d'ici quelques minutes, n'oubliez pas de vérifier vos{" "}
          <span className="font-semibold">spams</span>.
        </p>
      </div>

      <button
        onClick={onBack}
        className="w-full rounded-2xl bg-orange-500 py-4 text-base font-bold text-white shadow-md active:scale-95 transition-transform"
      >
        Retour à la connexion
      </button>
    </motion.div>
    );

    /* ─────────────────────────────────────────
     Page principale
    ───────────────────────────────────────── */
    const LoginPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const from = (location.state as any)?.from ?? "/boutique";

    const [tab, setTab] = useState<Tab>("connexion");
    const [loading, setLoading] = useState(false);

    // Connexion
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPwd,   setLoginPwd]   = useState("");
    const [showLoginPwd, setShowLoginPwd] = useState(false);

    // Inscription
    const [prenom,   setPrenom]   = useState("");
    const [nom,      setNom]      = useState("");
    const [regEmail, setRegEmail] = useState("");
    const [phone,    setPhone]    = useState("");
    const [country,  setCountry]  = useState(COUNTRIES[0]);
    const [regPwd,   setRegPwd]   = useState("");
    const [regPwd2,  setRegPwd2]  = useState("");
    const [showPwd,  setShowPwd]  = useState(false);
    const [showPwd2, setShowPwd2] = useState(false);
    const [showCountryList, setShowCountryList] = useState(false);

    if (user) { navigate(from, { replace: true }); return null; }

    /* ── Connexion ── */
    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!loginEmail || !loginPwd) { toast.error("Remplissez tous les champs"); return; }
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPwd });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      navigate(from, { replace: true });
    };

    /* ── Inscription ── */
    const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!prenom || !nom || !regEmail || !phone || !regPwd) {
        toast.error("Remplissez tous les champs obligatoires"); return;
      }
      if (regPwd !== regPwd2) { toast.error("Les mots de passe ne correspondent pas"); return; }
      if (regPwd.length < 8) { toast.error("Mot de passe trop court (min 8 caractères)"); return; }
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email: regEmail,
        password: regPwd,
        options: {
          data: {
            first_name: prenom,
            last_name: nom,
            phone: `${country.dial}${phone}`,
            country: country.name,
          },
        },
      });
      setLoading(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Compte créé ! Vous êtes connecté.");
      navigate(from, { replace: true });
    };
      );
    }

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-center pt-14 pb-6 px-4">
          <div className="flex rounded-full bg-gray-100 p-1 gap-1">
            <button
              onClick={() => setTab("connexion")}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                tab === "connexion" ? "bg-orange-500 text-white shadow" : "text-gray-500"
              }`}
            >
              Connexion
            </button>
            <button
              onClick={() => setTab("inscription")}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
                tab === "inscription" ? "bg-orange-500 text-white shadow" : "text-gray-500"
              }`}
            >
              Inscription
            </button>
          </div>
        </div>

        <div className="flex-1 px-5 pb-10">
          <AnimatePresence mode="wait">

            {/* ── CONNEXION ── */}
            {tab === "connexion" && (
              <motion.form
                key="connexion"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                onSubmit={handleLogin}
                className="space-y-4"
              >
                <Field label="Email">
                  <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                    placeholder="vous@exemple.com" className={inputCls} />
                </Field>

                <Field label="Mot de passe">
                  <div className="relative">
                    <input type={showLoginPwd ? "text" : "password"} value={loginPwd}
                      onChange={e => setLoginPwd(e.target.value)} placeholder="••••••••"
                      className={inputCls + " pr-11"} />
                    <button type="button" onClick={() => setShowLoginPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showLoginPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>

                <div className="text-right">
                  <button type="button" className="text-sm text-orange-500 font-medium hover:underline">
                    Mot de passe oublié ?
                  </button>
                </div>

                <button type="submit" disabled={loading}
                  className="mt-2 w-full rounded-2xl bg-orange-500 py-4 text-base font-bold text-white shadow-md active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Se connecter
                </button>

                <p className="text-center text-sm text-gray-500 pt-2">
                  Pas encore de compte ?{" "}
                  <button type="button" onClick={() => setTab("inscription")} className="text-orange-500 font-semibold hover:underline">
                    Inscrivez-vous
                  </button>
                </p>
              </motion.form>
            )}

            {/* ── INSCRIPTION ── */}
            {tab === "inscription" && (
              <motion.form
                key="inscription"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                onSubmit={handleRegister}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prénom">
                    <input value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Jean" className={inputCls} />
                  </Field>
                  <Field label="Nom">
                    <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Dupont" className={inputCls} />
                  </Field>
                </div>

                <Field label="Email">
                  <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                    placeholder="vous@exemple.com" className={inputCls} />
                </Field>

                <Field label="Téléphone">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowCountryList(v => !v)}
                      className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-700 whitespace-nowrap">
                      <span>{country.flag}</span>
                      <span>{country.dial}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    </button>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="00 00 00 00" className={inputCls} />
                  </div>
                </Field>

                <Field label="Pays de résidence">
                  <button type="button" onClick={() => setShowCountryList(v => !v)}
                    className={`${inputCls} flex items-center justify-between`}>
                    <span>{country.flag} {country.name}</span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </button>
                  {showCountryList && (
                    <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg z-10 relative">
                      {COUNTRIES.map(c => (
                        <button key={c.name} type="button"
                          onClick={() => { setCountry(c); setShowCountryList(false); }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-orange-50 text-left">
                          <span>{c.flag}</span>
                          <span className="flex-1">{c.name}</span>
                          <span className="text-gray-400">{c.dial}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mot de passe">
                    <div className="relative">
                      <input type={showPwd ? "text" : "password"} value={regPwd}
                        onChange={e => setRegPwd(e.target.value)} placeholder="••••••••"
                        className={inputCls + " pr-9 text-xs"} />
                      <button type="button" onClick={() => setShowPwd(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </Field>
                  <Field label="Confirmer">
                    <div className="relative">
                      <input type={showPwd2 ? "text" : "password"} value={regPwd2}
                        onChange={e => setRegPwd2(e.target.value)} placeholder="••••••••"
                        className={inputCls + " pr-9 text-xs"} />
                      <button type="button" onClick={() => setShowPwd2(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                        {showPwd2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </Field>
                </div>

                <button type="submit" disabled={loading}
                  className="mt-2 w-full rounded-2xl bg-orange-500 py-4 text-base font-bold text-white shadow-md active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Créer mon compte
                </button>

                <p className="text-center text-sm text-gray-500 pt-2">
                  Vous avez déjà un compte ?{" "}
                  <button type="button" onClick={() => setTab("connexion")} className="text-orange-500 font-semibold hover:underline">
                    Connectez-vous
                  </button>
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
    };

    export default LoginPage;
    