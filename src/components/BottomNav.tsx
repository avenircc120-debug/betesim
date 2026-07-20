import { Home, Smartphone, CreditCard, User } from "lucide-react";
    import { useLocation, useNavigate } from "react-router-dom";
    import { motion } from "framer-motion";

    const tabs = [
    { path: "/boutique",   label: "Accueil",    icon: Home },
    { path: "/historique", label: "Numéros",    icon: Smartphone },
    { path: "/wallet",     label: "Rechargeur", icon: CreditCard },
    { path: "/compte",     label: "Profil",     icon: User },
    ];

    const BottomNav = () => {
    const location = useLocation();
    const navigate = useNavigate();

    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-lg">
        <div className="mx-auto flex max-w-lg items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className="relative flex flex-col items-center gap-1 px-4 py-1 min-w-[60px]"
              >
                <div className={
                  `relative rounded-2xl p-2 transition-all duration-300 ${isActive ? "bg-orange-50" : ""}`
                }>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 rounded-2xl bg-orange-50"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <tab.icon
                    className={`relative h-5 w-5 transition-colors duration-300 ${
                      isActive ? "text-orange-500" : "text-gray-400"
                    }`}
                  />
                </div>
                <span className={`text-[11px] font-semibold transition-colors duration-300 ${
                  isActive ? "text-orange-500" : "text-gray-400"
                }`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    );
    };

    export default BottomNav;
    