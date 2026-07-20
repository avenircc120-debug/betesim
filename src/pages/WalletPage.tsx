import { useState } from "react";
    import { Bell, Menu, Check } from "lucide-react";
    import { motion } from "framer-motion";
    import BottomNav from "@/components/BottomNav";
    import DrawerMenu from "@/components/DrawerMenu";
    import { useProfile } from "@/hooks/useProfile";
    import { toast } from "sonner";

    type Pack = {
    coins: number;
    fcfa: number;
    badge?: string;
    badgeColor?: string;
    discount?: number;
    };

    const PACKS: Pack[] = [
    { coins: 10,   fcfa: 1_000,   badge: "Découverte", badgeColor: "bg-gray-200 text-gray-600" },
    { coins: 20,   fcfa: 2_000 },
    { coins: 35,   fcfa: 3_000,   discount: 14 },
    { coins: 46,   fcfa: 4_000,   discount: 14 },
    { coins: 58,   fcfa: 5_000,   discount: 14, badge: "POPULAIRE",      badgeColor: "bg-orange-500 text-white" },
    { coins: 118,  fcfa: 10_000,  discount: 15, badge: "Le plus populaire", badgeColor: "bg-orange-100 text-orange-600" },
    { coins: 180,  fcfa: 15_000,  discount: 17 },
    { coins: 250,  fcfa: 20_000,  discount: 20 },
    { coins: 650,  fcfa: 50_000,  discount: 23 },
    { coins: 1450, fcfa: 100_000, discount: 31 },
    ];

    const WalletPage = () => {
    const { data: profile } = useProfile();
    const [selected, setSelected] = useState<Pack>(PACKS[4]); // 5 000 FCFA par défaut
    const [drawerOpen, setDrawerOpen] = useState(false);

    const handleBuy = () => {
      toast.info("Fonctionnalité de paiement à venir.");
    };

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
            <button className="flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1.5">
              <span className="text-base">🪙</span>
              <span className="text-sm font-semibold text-orange-500">
                {profile?.fcfa_balance?.toLocaleString("fr-FR") ?? "0"}
              </span>
            </button>
            <button className="text-gray-500">
              <Bell className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pt-5 pb-4">
          <p className="text-xs font-bold tracking-widest text-gray-400 mb-4 text-center">
            SÉLECTION RAPIDE
          </p>

          <div className="grid grid-cols-2 gap-3">
            {PACKS.map((pack) => {
              const isSelected = selected.coins === pack.coins;
              return (
                <motion.button
                  key={pack.coins}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setSelected(pack)}
                  className={`relative rounded-2xl border-2 bg-white p-4 text-left transition-all ${
                    isSelected
                      ? "border-orange-500 bg-orange-50 shadow-md"
                      : "border-gray-200 shadow-sm"
                  } ${pack.fcfa === 100_000 ? "col-span-2" : ""}`}
                >
                  {/* Badge */}
                  {pack.badge && (
                    <span className={`absolute -top-2.5 left-3 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${pack.badgeColor}`}>
                      {pack.badge}
                    </span>
                  )}

                  {/* Selected checkmark */}
                  {isSelected && (
                    <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}

                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-2xl font-bold text-gray-900">{pack.coins}</span>
                    <span className="text-base">🪙</span>
                  </div>
                  <p className="text-sm font-medium text-gray-600">
                    {pack.fcfa.toLocaleString("fr-FR")} FCFA
                  </p>
                  {pack.discount && (
                    <p className="text-xs font-semibold text-green-600 mt-0.5">
                      -{pack.discount} %
                    </p>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Fixed bottom button */}
        <div className="fixed bottom-16 left-0 right-0 px-4 pb-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleBuy}
            className="w-full rounded-2xl bg-orange-500 py-4 text-center text-base font-bold text-white shadow-lg"
          >
            Confirmateur &amp; Payeur · {selected.fcfa.toLocaleString("fr-FR")} FCFA
          </motion.button>
        </div>

        <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <BottomNav />
      </div>
    );
    };

    export default WalletPage;
    