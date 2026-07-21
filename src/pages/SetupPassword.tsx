import { useState, useEffect } from "react";
import { Eye, EyeOff, Shield, Smartphone, Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

const SetupPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const from = (location.state as any)?.from ?? "/accueil";

  const [pwd, setPwd]   = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [loading,  setLoading]  = useState(false);

  // Rediriger si pas connecté
  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  const strength =
    pwd.length === 0 ? 0 :
    pwd.length < 6   ? 1 :
    pwd.length < 8   ? 2 :
    pwd.length < 12  ? 3 : 4;

  const strengthLabel = ["", "Trop court", "Faible", "Acceptable", "Fort"][strength];
  const strengthColor = ["", "bg-red-400", "bg-orange-300", "bg-yellow-400", "bg-green-500"][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwd || !pwd2)     { toast.error("Remplissez tous les champs"); return; }
    if (pwd !== pwd2)      { toast.error("Les mots de passe ne correspondent pas"); return; }
    if (pwd.length < 8)    { toast.error("Mot de passe trop court (minimum 8 caractères)"); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: pwd,
        data: { password_configured: true },
      });
      if (error) throw error;
      toast.success("Mot de passe configuré ! Bienvenue sur Betesim 🎉");
      navigate(from, { replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la configuration du mot de passe");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-5 pb-10">
        {/* Icône */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-100 mb-6">
          <Shield className="h-10 w-10 text-orange-500" />
        </div>

        <div className="text-center space-y-2 mb-8">
          <h1 className="text-2xl font-extrabold text-gray-900">Sécurisez votre compte</h1>
          <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
            Créez un mot de passe pour vous connecter depuis n'importe quel appareil,
            sans avoir besoin de Google.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          {/* Mot de passe */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">
              Nouveau mot de passe <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                placeholder="Minimum 8 caractères"
                className={inputCls + " pr-11"}
              />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {pwd.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i}
                      className={`flex-1 h-1 rounded-full transition-all ${i <= strength ? strengthColor : "bg-gray-200"}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-400">{strengthLabel}</p>
              </div>
            )}
          </div>

          {/* Confirmation */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">
              Confirmer le mot de passe <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPwd2 ? "text" : "password"}
                value={pwd2}
                onChange={e => setPwd2(e.target.value)}
                placeholder="••••••••"
                className={inputCls + " pr-11"}
              />
              <button type="button" onClick={() => setShowPwd2(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPwd2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {pwd2.length > 0 && pwd !== pwd2 && (
              <p className="mt-1 text-xs text-red-500">Les mots de passe ne correspondent pas</p>
            )}
          </div>

          {/* Info box */}
          <div className="w-full rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
            <div className="flex items-start gap-2">
              <Smartphone className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-600 leading-relaxed">
                Avec ce mot de passe, vous pourrez vous connecter avec votre email sur
                un autre téléphone, sans avoir besoin de Google.
              </p>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full rounded-2xl bg-orange-500 py-4 text-base font-bold text-white shadow-md active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer mon mot de passe
          </button>

          <button type="button" onClick={() => navigate(from, { replace: true })}
            className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-2">
            Passer pour l'instant
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetupPassword;
