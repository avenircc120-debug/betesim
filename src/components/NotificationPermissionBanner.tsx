import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/hooks/useAuth";

const NotificationPermissionBanner = () => {
  const { user } = useAuth();
  const { permission, isSubscribed, isLoading, subscribe, isSupported } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Show banner only if: user is logged in, notifications supported, not yet subscribed, not dismissed
    const wasDismissed = localStorage.getItem("push-banner-dismissed");
    if (user && isSupported && permission === "default" && !isSubscribed && !wasDismissed) {
      // Delay showing banner
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowBanner(false);
    }
  }, [user, isSupported, permission, isSubscribed]);

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowBanner(false);
    localStorage.setItem("push-banner-dismissed", "true");
  };

  return (
    <AnimatePresence>
      {showBanner && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-0 left-0 right-0 z-50 p-3"
        >
          <div className="mx-auto max-w-lg rounded-2xl border border-primary/20 bg-card/95 backdrop-blur-lg p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-sm">
                  Activez les notifications 🔔
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Recevez des alertes quand votre vitesse diminue ou quand un filleul s'inscrit
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleEnable}
                    disabled={isLoading}
                    className="h-8 rounded-lg text-xs"
                  >
                    {isLoading ? "..." : "Activer"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDismiss}
                    className="h-8 rounded-lg text-xs text-muted-foreground"
                  >
                    Plus tard
                  </Button>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationPermissionBanner;
