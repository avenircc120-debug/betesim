import { Bell, Check, CheckCheck, Trash2, Users, Download, Info, AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const typeIcons: Record<string, typeof Bell> = {
  referral: Users,
  withdrawal: Download,
  warning: AlertTriangle,
  info: Info,
  success: Check,
};

const typeColors: Record<string, string> = {
  referral: "gradient-gold",
  withdrawal: "gradient-accent",
  warning: "bg-warning",
  info: "gradient-primary",
  success: "gradient-accent",
};

const NotificationCenter = () => {
  const { notifications, unreadCount, markAsRead, markAllRead, deleteNotification } = useNotifications();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-card shadow-card transition-shadow hover:shadow-card-hover">
          <Bell className="h-5 w-5 text-foreground" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full gradient-primary text-[10px] font-bold text-primary-foreground"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 bg-background">
        <SheetHeader className="p-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl font-bold">Notifications</SheetTitle>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Tout lire
              </button>
            )}
          </div>
        </SheetHeader>

        <div className="overflow-y-auto h-[calc(100vh-5rem)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Bell className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="font-medium text-muted-foreground">Aucune notification</p>
              <p className="text-sm text-muted-foreground/70">Vous serez notifié ici</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              <AnimatePresence>
                {notifications.map((notif) => {
                  const Icon = typeIcons[notif.type] ?? Bell;
                  const colorClass = typeColors[notif.type] ?? "gradient-primary";

                  return (
                    <motion.div
                      key={notif.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className={`relative flex gap-3 p-4 transition-colors ${
                        !notif.read ? "bg-primary/5" : ""
                      }`}
                      onClick={() => {
                        if (!notif.read) markAsRead.mutate(notif.id);
                      }}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
                        <Icon className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-foreground text-sm">{notif.title}</p>
                          {!notif.read && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: fr })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification.mutate(notif.id);
                        }}
                        className="shrink-0 self-center rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationCenter;
