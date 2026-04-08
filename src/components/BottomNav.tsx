import { Home, Cpu, Wallet, Clock, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const tabs = [
  { path: "/", label: "Accueil", icon: Home },
  { path: "/machine", label: "Machine", icon: Cpu },
  { path: "/wallet", label: "Wallet", icon: Wallet },
  { path: "/historique", label: "Historique", icon: Clock },
  { path: "/compte", label: "Compte", icon: User },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 shadow-nav">
      <div className="mx-auto flex max-w-lg items-center justify-around py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="relative flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors"
            >
              <div className={`relative rounded-2xl p-2 transition-all duration-300 ${
                isActive ? "bg-primary/10" : ""
              }`}>
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 rounded-2xl bg-primary/10"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <tab.icon className={`relative h-5 w-5 transition-colors duration-300 ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`} />
              </div>
              <span className={`font-medium transition-colors duration-300 ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
