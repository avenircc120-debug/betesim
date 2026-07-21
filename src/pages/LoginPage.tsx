import { useState, useEffect } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/firebase";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

type Tab = "connexion" | "inscription";

/** Détecte si un utilisateur Google n'a pas encore configuré de mot de passe */
function needsPasswordSetup(user: User): boolean {
  const providers = (user.app_metadata?.providers ?? []) as string[];
  const passwordConfigured = user.user_metadata?.password_configured === true;
  return providers.includes("google") && !providers.includes("email") && !passwordConfigured;
}

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

const GoogleButton = ({ onClick, loading, label }: {
  onClick: () => void; loading: boolean; label: string;
}) => (
  <button type="button" onClick={onClick} disabled={loading}
    className="w-full flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-3.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-60">
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
    {label}
  </button>
);

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const from = (location.state as any)?.from ?? "/accueil";

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  const [tab, setTab] = useState<Tab>("connexion");
  const [loading, setLoading] = useState(false);

  // Connexion
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd]   = useState("");
  const [showLoginPwd, setShowLoginPwd] = useState(false);

  /* ── Google Sign-In ── */
  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const idToken = await signInWithGoogle();
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
      if (error) throw error;
      toast.success("Connexion Google réussie !");
      // Rediriger vers la configuration du mot de passe si c'est un nouvel utilisateur Google
      if (data.user && needsPasswordSetup(data.user)) {
        navigate("/setup-password", { replace: true, state: { from } });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la connexion Google");
    } finally {
      setLoading(false);
    }
  };

  /* ── Connexion email/mot de passe ── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPwd) { toast.error("Remplissez tous les champs"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPwd });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    navigate(from, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Tab bar */}
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

          {/* ── CONNEXION (inchangé) ── */}
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
                <button type="button" onClick={() => navigate("/reset-password")}
                  className="text-sm text-orange-500 font-medium hover:underline">
                  Mot de passe oublié ?
                </button>
              </div>

              <button type="submit" disabled={loading}
                className="mt-2 w-full rounded-2xl bg-orange-500 py-4 text-base font-bold text-white shadow-md active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Se connecter
              </button>

              <div className="flex items-center gap-3 pt-1">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">ou</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <GoogleButton onClick={handleGoogleSignIn} loading={loading} label="Continuer avec Google" />

              <p className="text-center text-sm text-gray-500 pt-2">
                Pas encore de compte ?{" "}
                <button type="button" onClick={() => setTab("inscription")}
                  className="text-orange-500 font-semibold hover:underline">
                  Inscrivez-vous
                </button>
              </p>
            </motion.form>
          )}

          {/* ── INSCRIPTION : Google uniquement ── */}
          {tab === "inscription" && (
            <motion.div
              key="inscription"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2 pt-4">
                <h2 className="text-xl font-extrabold text-gray-900">Créez votre compte Betesim</h2>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Inscrivez-vous en un clic avec votre compte Google.
                  Vous pourrez définir un mot de passe ensuite.
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 space-y-3">
                {[
                  { icon: "⚡", text: "Inscription en 1 clic avec Google" },
                  { icon: "🔒", text: "Configurez un mot de passe après l'inscription" },
                  { icon: "📱", text: "Accédez depuis n'importe quel appareil" },
                ].map((item) => (
                  <div key={item.icon} className="flex items-center gap-3">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-sm text-gray-700">{item.text}</span>
                  </div>
                ))}
              </div>

              <GoogleButton onClick={handleGoogleSignIn} loading={loading} label="Continuer avec Google" />

              <p className="text-center text-xs text-gray-400 leading-relaxed px-4">
                En continuant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
              </p>

              <p className="text-center text-sm text-gray-500">
                Vous avez déjà un compte ?{" "}
                <button type="button" onClick={() => setTab("connexion")}
                  className="text-orange-500 font-semibold hover:underline">
                  Connectez-vous
                </button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LoginPage;
