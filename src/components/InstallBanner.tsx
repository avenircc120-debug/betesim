import { useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

const DISMISS_KEY = 'pi-install-dismissed';

const InstallBanner = () => {
  const { canInstall, isInstalled, isIOS, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < 24 * 60 * 60 * 1000;
  });
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const shouldShow = !isInstalled && !dismissed && (canInstall || isIOS);

  return (
    <>
      <AnimatePresence>
        {shouldShow && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-[72px] left-0 right-0 z-40 px-3"
          >
            <div className="mx-auto max-w-lg rounded-2xl bg-card border border-border/50 shadow-lg p-3 flex items-center gap-3">
              <img
                src="/logo.png"
                alt="PI REAL"
                className="h-10 w-10 rounded-xl object-contain flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Installer PI REAL</p>
                <p className="text-xs text-muted-foreground truncate">
                  Accès rapide depuis votre écran d'accueil
                </p>
              </div>
              {canInstall && (
                <button
                  onClick={promptInstall}
                  className="flex items-center gap-1.5 rounded-xl gradient-primary px-3 py-2 text-xs font-semibold text-white shadow-glow flex-shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  Installer
                </button>
              )}
              {isIOS && !canInstall && (
                <button
                  onClick={() => setShowIOSGuide(true)}
                  className="flex items-center gap-1.5 rounded-xl gradient-primary px-3 py-2 text-xs font-semibold text-white shadow-glow flex-shrink-0"
                >
                  <Share className="h-3.5 w-3.5" />
                  Comment
                </button>
              )}
              <button
                onClick={handleDismiss}
                className="p-1.5 text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showIOSGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-6"
            onClick={() => setShowIOSGuide(false)}
          >
            <motion.div
              initial={{ y: 200 }}
              animate={{ y: 0 }}
              exit={{ y: 200 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground">Installer sur iPhone/iPad</h2>
                <button onClick={() => setShowIOSGuide(false)} className="text-muted-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ol className="space-y-3">
                {[
                  { step: '1', text: 'Ouvrir Safari (recommandé sur iPhone)' },
                  { step: '2', text: "Appuyez sur le bouton Partager (carré avec flèche) en bas" },
                  { step: '3', text: "Faites défiler et appuyez sur «\u202fSur l'écran d'accueil\u202f»" },
                  { step: '4', text: "Appuyez sur «\u202fAjouter\u202f»" },
                ].map(({ step, text }) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full gradient-primary text-xs font-bold text-white">
                      {step}
                    </span>
                    <span className="text-sm text-foreground pt-1">{text}</span>
                  </li>
                ))}
              </ol>
              <button
                onClick={() => { setShowIOSGuide(false); handleDismiss(); }}
                className="w-full rounded-xl bg-muted py-3 text-sm font-medium text-muted-foreground"
              >
                Fermer
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default InstallBanner;
