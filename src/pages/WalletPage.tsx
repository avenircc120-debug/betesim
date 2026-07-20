import { useState } from "react";
import { Bell, Menu, Check, LogIn } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import DrawerMenu from "@/components/DrawerMenu";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

type Pack = {
  coins: number;
  fcfa: number;
  badge?: string;
  badgeColor?: string;
  discount?: number;
};

const PACKS: Pack[] = [
  { coins: 10,   fcfa: 1_000,   badge: "Découverte",        badgeColor: "bg-gray-200 text-gray-600" },
  { coins: 20,   fcfa: 2_000 },
  { coins: 35,   fcfa: 3_000,   discount: 14 },
  { coins: 46,   fcfa: 4_000,   discount: 14 },
  { coins: 58,   fcfa: 5_000,   discount: 14, badge: "POPULAIRE",         badgeColor: "bg-orange-500 text-white" },
  { coins: 118,  fcfa: 10_000,  discount: 15, badge: "Top",               badgeColor: "bg-orange-100 text-orange-600" },
  { coins: 180,  fcfa: 15_000,  discount: 17 },
  { coins: 250,  fcfa: 20_000,  discount: 20 },
  { coins: 650,  fcfa: 50_000,  discount: 23 },
  { coins: 1450, fcfa: 100_000, discount: 31, badge: "Meilleur prix",     badgeColor: "bg-green-100 text-green-700" },
];

const WalletPage = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { data: profile } = useProfile();
  const [selected, setSelected] = useState<Pack>(PACKS[4]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleBuy = () => {
    if (!user) {
      navigate("/login", { state: { from: "/recharger" } });
      return;
    }
    alert("Paiement à venir !");
  };

  const fmt = (n: number) =>
    n >= 1_000 ? `${(n / 1_000).toLocaleString("fr-FR")}k` : String(n);

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
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
                {profile?.fcfa_balance?.toLocaleString("fr-FR") ?? "0"}
              </span>
            </button>
          ) : (
            <button
              onClick={() => navigate("/login", { state: { from: "/recharger" } })}
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

      <div className="px-4 pt-4 pb-4">
        <p className="text-xs font-bold tracking-widest text-gray-400 mb-3 text-center">
          CHOISIR UN MONTANT
        </p>

        {/* Grille compacte 3 colonnes — tout visible sans défiler */}
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
                {/* Badge */}
                {pack.badge && (
                  <span
                    className={`absolute -top-2 left-2 rounded-full px-2 py-px text-[9px] font-bold leading-tight ${pack.badgeColor}`}
                  >
                    {pack.badge}
                  </span>
                )}

                {/* Checkmark */}
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </span>
                )}

                {/* Coins */}
                <div className="flex items-baseline gap-0.5 mt-1">
                  <span className={`font-bold text-gray-900 leading-none ${isLast ? "text-2xl" : "text-xl"}`}>
                    {pack.coins}
                  </span>
                  <span className="text-sm leading-none">🪙</span>
                </div>

                {/* Prix */}
                <p className="text-[11px] font-semibold text-gray-500 mt-1 leading-tight">
                  {isLast
                    ? pack.fcfa.toLocaleString("fr-FR") + " F"
                    : fmt(pack.fcfa) + " F"}
                </p>

                {/* Réduction */}
                {pack.discount && (
                  <p className="text-[10px] font-bold text-green-600 mt-0.5">
                    -{pack.discount}%
                  </p>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Bouton fixe en bas */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleBuy}
          className="w-full rounded-2xl bg-orange-500 py-4 text-center text-base font-bold text-white shadow-lg"
        >
          {loading
            ? "Chargement…"
            : user
              ? `Recharger · ${selected.fcfa.toLocaleString("fr-FR")} FCFA`
              : `Se connecter · ${selected.fcfa.toLocaleString("fr-FR")} FCFA`}
        </motion.button>
      </div>

      <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <BottomNav />
    </div>
  );
};

export default WalletPage;
