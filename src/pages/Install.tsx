import { useState, useEffect } from "react";
import { Download, Share, Check, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) setIsInstalled(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-6 px-4 pt-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center space-y-4"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl gradient-primary shadow-glow">
            <span className="text-3xl font-bold text-primary-foreground">π</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Installer PI REAL</h1>
          <p className="text-muted-foreground">
            Installez l'application sur votre téléphone pour y accéder comme une vraie app
          </p>
        </motion.div>

        {isInstalled ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl bg-card p-6 shadow-card text-center space-y-3"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <Check className="h-7 w-7 text-accent" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Déjà installée !</h2>
            <p className="text-sm text-muted-foreground">
              PI REAL est déjà installée sur votre appareil.
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            {deferredPrompt ? (
              <Button
                onClick={handleInstall}
                className="h-14 w-full rounded-xl gradient-primary text-primary-foreground font-semibold text-base shadow-glow"
              >
                <Download className="h-5 w-5 mr-2" />
                Installer l'application
              </Button>
            ) : isIOS ? (
              <div className="rounded-2xl bg-card p-5 shadow-card space-y-4">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Installation sur iPhone</h3>
                </div>
                <div className="space-y-3">
                  {[
                    { step: "1", text: "Appuyez sur le bouton Partager en bas de Safari" },
                    { step: "2", text: "Faites défiler et appuyez sur « Sur l'écran d'accueil »" },
                    { step: "3", text: "Appuyez sur « Ajouter »" },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full gradient-primary text-xs font-bold text-primary-foreground">
                        {item.step}
                      </span>
                      <p className="text-sm text-muted-foreground pt-1">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-card p-5 shadow-card space-y-4">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Installation sur Android</h3>
                </div>
                <div className="space-y-3">
                  {[
                    { step: "1", text: "Ouvrez le menu (⋮) de votre navigateur" },
                    { step: "2", text: "Appuyez sur « Installer l'application » ou « Ajouter à l'écran d'accueil »" },
                    { step: "3", text: "Confirmez l'installation" },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full gradient-primary text-xs font-bold text-primary-foreground">
                        {item.step}
                      </span>
                      <p className="text-sm text-muted-foreground pt-1">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Benefits */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Avantages</h3>
          {[
            { icon: Smartphone, title: "Comme une vraie app", desc: "Accès rapide depuis l'écran d'accueil" },
            { icon: Download, title: "Fonctionne hors-ligne", desc: "Chargement ultra rapide même sans connexion" },
            { icon: Share, title: "Partageable", desc: "Envoyez le lien à vos amis facilement" },
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl gradient-primary">
                <item.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Install;
