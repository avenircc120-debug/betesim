import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 500);
    }, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
          style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)" }}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="120" height="120">
              <defs>
                <linearGradient id="simGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{ stopColor: "#6366f1", stopOpacity: 1 }} />
                  <stop offset="100%" style={{ stopColor: "#a78bfa", stopOpacity: 1 }} />
                </linearGradient>
              </defs>
              <rect x="30" y="20" width="140" height="160" rx="16" ry="16" fill="url(#simGrad)" />
              <polygon points="30,20 68,20 30,58" fill="white" opacity="0.15" />
              <rect x="50" y="60" width="100" height="70" rx="10" ry="10" fill="white" opacity="0.15" />
              <rect x="62" y="72" width="76" height="46" rx="7" ry="7" fill="white" opacity="0.2" />
              <line x1="80" y1="72" x2="80" y2="118" stroke="white" strokeWidth="1.5" opacity="0.5" />
              <line x1="100" y1="72" x2="100" y2="118" stroke="white" strokeWidth="1.5" opacity="0.5" />
              <line x1="120" y1="72" x2="120" y2="118" stroke="white" strokeWidth="1.5" opacity="0.5" />
              <line x1="62" y1="90" x2="138" y2="90" stroke="white" strokeWidth="1.5" opacity="0.5" />
              <line x1="62" y1="105" x2="138" y2="105" stroke="white" strokeWidth="1.5" opacity="0.5" />
              <text x="100" y="158" fontFamily="Arial, sans-serif" fontSize="20" fontWeight="bold" fill="white" textAnchor="middle" letterSpacing="1">betesim</text>
            </svg>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-6 text-4xl font-bold tracking-tight text-white"
          >
            bete<span style={{ color: "#a78bfa" }}>sim</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-2 text-sm"
            style={{ color: "#c4b5fd" }}
          >
            Numéros virtuels pour tous vos services
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-8"
          >
            <div className="h-1 w-24 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="h-full w-1/2 rounded-full"
                style={{ background: "linear-gradient(90deg, #6366f1, #a78bfa)" }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
