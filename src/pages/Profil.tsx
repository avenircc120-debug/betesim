import { useNavigate } from "react-router-dom";
import { LogIn, LogOut, User, Smartphone, ShoppingBag, History } from "lucide-react";
import { motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

const Profil = () => {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const { data: profile } = useProfile();

  // Chargement en cours
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
        <p className="text-sm text-gray-400 font-medium">Chargement…</p>
        <BottomNav />
      </div>
    );
  }

  // Non connecté
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-5 text-center max-w-xs"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-orange-100">
            <User className="h-10 w-10 text-orange-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Mon Profil</h2>
            <p className="mt-1 text-sm text-gray-500">
              Connectez-vous pour accéder à votre espace personnel.
            </p>
          </div>
          <button
            onClick={() => navigate("/login", { state: { from: "/profil" } })}
            className="flex items-center gap-2 rounded-2xl bg-orange-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-200"
          >
            <LogIn className="h-4 w-4" />
            Se connecter
          </button>
        </motion.div>
        <BottomNav />
      </div>
    );
  }

  const displayName = profile?.username ?? user.email?.split("@")[0] ?? "Utilisateur";
  const displayInitial = displayName[0].toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const menuItems = [
    { icon: ShoppingBag, label: "Boutique SIM", desc: "Acheter un numéro virtuel", path: "/accueil" },
    { icon: History,     label: "Mes numéros",  desc: "Historique de vos achats",  path: "/numeros" },
    { icon: Smartphone,  label: "Rechargeur",   desc: "Recharger votre wallet",    path: "/recharger" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-5 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Profil</h1>
      </div>

      <div className="mx-auto max-w-lg px-4 pt-5 space-y-4">
        {/* Avatar card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-xl font-bold text-white shadow-md shadow-orange-200">
            {displayInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 truncate">{displayName}</p>
            <p className="text-sm text-gray-400 truncate">{user.email ?? "—"}</p>
          </div>
        </motion.div>

        {/* Solde */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl bg-orange-500 p-5 shadow-md shadow-orange-200"
        >
          <p className="text-xs font-semibold text-orange-100 mb-1">Solde Coins</p>
          <p className="text-3xl font-bold text-white">
            {(profile?.coin_balance ?? 0).toLocaleString("fr-FR")}
            <span className="text-base font-medium ml-1">Coins</span>
          </p>
          <button
            onClick={() => navigate("/recharger")}
            className="mt-3 rounded-xl bg-white/20 px-4 py-2 text-xs font-bold text-white"
          >
            Recharger →
          </button>
        </motion.div>

        {/* Menu rapide */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white shadow-sm overflow-hidden"
        >
          {menuItems.map((item, i) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-orange-50 transition-colors ${
                i > 0 ? "border-t border-gray-100" : ""
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100">
                <item.icon className="h-5 w-5 text-orange-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
            </button>
          ))}
        </motion.div>

        {/* Déconnexion */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-red-100 bg-white py-4 text-sm font-bold text-red-500 shadow-sm"
        >
          <LogOut className="h-4 w-4" />
          Se déconnecter
        </motion.button>
      </div>

      <BottomNav />
    </div>
  );
};

export default Profil;
