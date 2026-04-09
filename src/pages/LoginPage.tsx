
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Screen = "login" | "register";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [screen, setScreen] = useState<Screen>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const refCode = new URLSearchParams(location.search).get("ref");
    if (refCode) {
      localStorage.setItem("pending_referral", refCode);
      window.history.replaceState({}, "", location.pathname);
    }
  }, [location.search, location.pathname]);

  function reset() {
    setName(""); setEmail(""); setPassword(""); setError(""); setInfo("");
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setInfo("");
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setLoading(true);

    const refCode = localStorage.getItem("pending_referral");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: name.trim(),
          ...(refCode ? { referral_code: refCode } : {}),
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      if (refCode) localStorage.removeItem("pending_referral");
      navigate("/");
    } else {
      setInfo("Compte créé ! Vous pouvez maintenant vous connecter.");
      setScreen("login");
      reset();
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setInfo("");
    if (!email.trim() || !password.trim()) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }
    navigate("/");
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm mx-4">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {screen === "login" ? "Connexion" : "Créer un compte"}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {screen === "login" ? "Accédez à votre compte" : "Rejoignez Betesim"}
          </p>
        </div>

        <form onSubmit={screen === "login" ? handleLogin : handleRegister} className="space-y-4">
          {screen === "register" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jean Dupont"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}
          {info && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl py-3 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Chargement..." : screen === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-gray-500">
          {screen === "login" ? (
            <>
              Pas encore de compte ?{" "}
              <button onClick={() => { setScreen("register"); reset(); }} className="text-blue-600 hover:underline font-medium">
                S'inscrire
              </button>
            </>
          ) : (
            <>
              Déjà un compte ?{" "}
              <button onClick={() => { setScreen("login"); reset(); }} className="text-blue-600 hover:underline font-medium">
                Se connecter
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
