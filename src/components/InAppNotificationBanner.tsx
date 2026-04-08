import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, AlertTriangle, Gift, Info } from "lucide-react";

interface NotificationData {
  title: string;
  message: string;
  type: string;
}

const ICON_MAP: Record<string, typeof Bell> = {
  referral: Gift,
  warning: AlertTriangle,
  info: Info,
};

const COLOR_MAP: Record<string, string> = {
  referral: "bg-accent/10 border-accent/30 text-accent",
  warning: "bg-amber-500/10 border-amber-400/30 text-amber-500",
  info: "bg-primary/10 border-primary/30 text-primary",
  withdrawal: "bg-emerald-500/10 border-emerald-400/30 text-emerald-500",
};

const InAppNotificationBanner = () => {
  const [notifications, setNotifications] = useState<(NotificationData & { id: number })[]>([]);
  const [counter, setCounter] = useState(0);

  const addNotification = useCallback((data: NotificationData) => {
    setCounter((prev) => {
      const id = prev + 1;
      setNotifications((n) => [...n, { ...data, id }]);
      // Auto-dismiss after 5s
      setTimeout(() => {
        setNotifications((n) => n.filter((x) => x.id !== id));
      }, 5000);
      return id;
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as NotificationData;
      addNotification(detail);
    };
    window.addEventListener("pi-notification", handler);
    return () => window.removeEventListener("pi-notification", handler);
  }, [addNotification]);

  const dismiss = (id: number) => {
    setNotifications((n) => n.filter((x) => x.id !== id));
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none flex flex-col items-center gap-2 p-3">
      <AnimatePresence>
        {notifications.map((notif) => {
          const IconComp = ICON_MAP[notif.type] || Bell;
          const colorClass = COLOR_MAP[notif.type] || COLOR_MAP.info;

          return (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, y: -60, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.9 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className={`pointer-events-auto w-full max-w-md rounded-2xl border backdrop-blur-xl bg-card/95 p-4 shadow-2xl ${colorClass}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
                  <IconComp className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground text-sm">{notif.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{notif.message}</p>
                </div>
                <button
                  onClick={() => dismiss(notif.id)}
                  className="shrink-0 p-1 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default InAppNotificationBanner;
