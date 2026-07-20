import { X, LayoutDashboard, Smartphone, CreditCard, Settings, LogOut } from "lucide-react";
    import { useNavigate, useLocation } from "react-router-dom";
    import { motion, AnimatePresence } from "framer-motion";
    import { useAuth } from "@/hooks/useAuth";
    import { useProfile } from "@/hooks/useProfile";

    interface DrawerMenuProps {
    open: boolean;
    onClose: () => void;
    }

    const NAV_ITEMS = [
    { label: "Tableau de bord", icon: LayoutDashboard, path: "/boutique" },
    { label: "Mes numéros",     icon: Smartphone,      path: "/historique" },
    { label: "Rechargeur",      icon: CreditCard,       path: "/wallet" },
    { label: "Paramètres",      icon: Settings,         path: "/compte" },
    ];

    export default function DrawerMenu({ open, onClose }: DrawerMenuProps) {
    const { user, signOut } = useAuth();
    const { data: profile } = useProfile();
    const navigate = useNavigate();
    const location = useLocation();

    const handleNav = (path: string) => {
      navigate(path);
      onClose();
    };

    const handleSignOut = async () => {
      onClose();
      await signOut();
    };

    const initials = (user?.displayName ?? user?.email ?? "?")
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    return (
      <AnimatePresence>
        {open && (
          <>
            {/* Overlay */}
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/50 z-40"
            />

            {/* Drawer */}
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className="fixed top-0 left-0 h-full w-72 bg-gray-950 z-50 flex flex-col"
            >
              {/* Header */}
              <div className="px-5 pt-10 pb-6 border-b border-gray-800">
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shrink-0">
                      <Smartphone className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-bold text-base leading-tight">Numéro <span className="text-orange-400">SMS</span></p>
                      <p className="text-gray-400 text-xs">Afrique</p>
                    </div>
                  </div>
                  <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-800 transition-colors">
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                {/* User info */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
                    <span className="text-white text-sm font-bold">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{user?.displayName ?? "Utilisateur"}</p>
                    <p className="text-gray-400 text-xs truncate">{user?.email ?? ""}</p>
                  </div>
                </div>

                {/* Credits badge */}
                <div className="mt-3">
                  <span className="inline-flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-full px-3 py-1.5 text-sm font-semibold text-gray-200">
                    <span className="text-orange-400">🔗</span>
                    {profile?.fcfa_balance?.toLocaleString("fr-FR") ?? 0} crédits
                  </span>
                </div>
              </div>

              {/* Nav items */}
              <nav className="flex-1 px-3 py-4 space-y-1">
                {NAV_ITEMS.map(({ label, icon: Icon, path }) => {
                  const active = location.pathname === path;
                  return (
                    <button
                      key={path}
                      onClick={() => handleNav(path)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all ${
                        active
                          ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30"
                          : "text-gray-400 hover:bg-gray-800 hover:text-white"
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="font-semibold text-sm">{label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Logout */}
              <div className="px-3 pb-10 pt-2 border-t border-gray-800">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-orange-500 hover:bg-gray-800 transition-colors"
                >
                  <LogOut className="w-5 h-5 shrink-0" />
                  <span className="font-semibold text-sm">Déconnexion</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
    }
    