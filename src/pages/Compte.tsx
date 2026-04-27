
import { useState } from "react";
import { User, Shield, HelpCircle, LogOut, ChevronRight, Users, Bell, Settings, Star, Pencil, Check, X, Trophy, Moon, Sun, Lock, Eye, EyeOff, Phone } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import BottomNav from "@/components/BottomNav";
import ShareButtons from "@/components/ShareButtons";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const Compte = () => {
  const { user, signOut, showAuthModal } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [showSecurity, setShowSecurity] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains("dark"));

  const displayName = profile?.username ?? user?.email?.split("@")[0] ?? "Utilisateur";
  const displayInitial = displayName[0].toUpperCase();
  const isPartner = !!(profile as any)?.is_partner;

  const { data: referralCount } = useQuery({
    queryKey: ["referral-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase.from("referrals").select("*", { count: "exact", head: true }).eq("referrer_id", user.id).eq("activated", true);
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: referrals } = useQuery({
    queryKey: ["referral-list", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("referrals").select("id, created_at, activated, referred_id").eq("referrer_id", user.id).order("created_at", { ascending: false }).limit(10);
      return data ?? [];
    },
    enabled: !!user && isPartner,
  });

  const { data: purchasedCount } = useQuery({
    queryKey: ["purchased-numbers-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("type", "number_purchase")
        .eq("status", "validated");
      return count ?? 0;
    },
    enabled: !!user,
  });

  const updateUsernameMutation = useMutation({
    mutationFn: async (username: string) => {
      if (!user) throw new Error("Non connecté");
      const trimmed = username.trim();
      if (!trimmed || trimmed.length < 2 || trimmed.length > 30) throw new Error("Le nom doit contenir entre 2 et 30 caractères");
      const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nom mis à jour !");
      setEditingUsername(false);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      toast.info("Votre sécurité est gérée par Google ou SMS. Aucun mot de passe requis.");
    },
    onSuccess: () => {
      setShowSecurity(false);
    },
  });

  const toggleTheme = () => {
    const newDark = !darkMode;
    setDarkMode(newDark);
    document.documentElement.classList.toggle("dark", newDark);
    localStorage.setItem("theme", newDark ? "dark" : "light");
    toast.success(newDark ? "Mode sombre activé" : "Mode clair activé");
  };

  const productionUrl = "https://betesim.vercel.app";
  const referralLink = `${productionUrl}?ref=${profile?.referral_code ?? ""}`;

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="mx-auto max-w-lg flex flex-col items-center justify-center min-h-[80vh] px-6 space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center space-y-5 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl gradient-hero shadow-glow">
              <User className="h-12 w-12 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Mon compte</h2>
              <p className="mt-2 text-sm text-muted-foreground">Connectez-vous pour accéder à votre profil, vos filleuls et vos statistiques.</p>
            </div>
            <Button
              onClick={() => showAuthModal("Connectez-vous pour accéder à votre compte")}
              className="h-14 w-full max-w-xs rounded-2xl gradient-primary text-primary-foreground font-semibold shadow-glow text-base"
            >
              Se connecter
            </Button>
            <p className="text-xs text-muted-foreground">Google ou SMS · Rapide et sécurisé</p>
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const startEditing = () => {
    setNewUsername(profile?.username ?? "");
    setEditingUsername(true);
  };

  const handleMenuClick = (label: string, path: string) => {
    if (path) { navigate(path); return; }
    switch (label) {
      case "Notifications": setShowNotifications(true); break;
      case "Sécurité": setShowSecurity(true); break;
      case "Préférences": setShowPreferences(true); break;
      case "Évaluer l'app": setShowRate(true); break;
    }
  };

  const menuSections = [
    { title: "Général", items: [{ icon: Bell, label: "Notifications", desc: "Gérer vos alertes", path: "" }, { icon: Trophy, label: "Classement", desc: "Top partenaires & parrains", path: "/leaderboard" }] },
    { title: "Sécurité", items: [{ icon: Shield, label: "Sécurité", desc: "Mot de passe", path: "" }, { icon: Settings, label: "Préférences", desc: "Thème et paramètres", path: "" }] },
    { title: "Support", items: [{ icon: HelpCircle, label: "Centre d'aide", desc: "FAQ et assistance", path: "/faq" }, { icon: Star, label: "Évaluer l'app", desc: "Donnez-nous 5 étoiles", path: "" }] },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center rounded-3xl bg-card p-6 shadow-card">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl gradient-hero text-3xl font-bold text-primary-foreground shadow-glow">{displayInitial}</div>
          {editingUsername ? (
            <div className="mt-3 flex items-center gap-2">
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="h-9 w-40 rounded-xl text-center text-sm" maxLength={30} autoFocus />
              <button onClick={() => updateUsernameMutation.mutate(newUsername)} disabled={updateUsernameMutation.isPending} className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Check className="h-4 w-4" /></button>
              <button onClick={() => setEditingUsername(false)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <button onClick={startEditing} className="mt-3 flex items-center gap-1.5 group">
              <h2 className="text-xl font-bold text-foreground">{displayName}</h2>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          <p className="text-sm text-muted-foreground">{profile?.email ?? user?.email}</p>
          {isPartner && (
            <span className="mt-1 rounded-full bg-amber-500/20 px-3 py-0.5 text-xs font-bold text-amber-600">
              Partenaire
            </span>
          )}
          <div className="mt-5 grid w-full grid-cols-3 gap-3 border-t border-border pt-5">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{purchasedCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Numéros achetés</p>
            </div>
            <div className="text-center border-x border-border">
              <p className="text-2xl font-bold text-foreground">{referralCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Filleuls</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{(profile?.fcfa_balance ?? 0).toLocaleString("fr-FR")}</p>
              <p className="text-xs text-muted-foreground">FCFA</p>
            </div>
          </div>
        </motion.div>

        {isPartner ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-2xl bg-card p-4 shadow-card space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold"><Users className="h-5 w-5 text-primary-foreground" /></div>
              <div>
                <h3 className="font-semibold text-foreground">Mon lien de parrainage</h3>
                <p className="text-xs text-muted-foreground">Gagnez des commissions sur chaque achat de vos filleuls</p>
              </div>
            </div>
            <ShareButtons referralLink={referralLink} />
            {referrals && referrals.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mes filleuls</p>
                {referrals.map((ref) => (
                  <div key={ref.id} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-accent"><User className="h-4 w-4 text-accent-foreground" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Filleul</p>
                      <p className="text-xs text-muted-foreground">{new Date(ref.created_at).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ref.activated ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning"}`}>{ref.activated ? "Actif" : "En attente"}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <button
              onClick={() => navigate("/boutique")}
              className="flex w-full items-center gap-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 transition-colors hover:bg-amber-500/15"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold text-foreground">Débloquer le parrainage</p>
                <p className="text-xs text-amber-600">Passez au Pack Partenaire (2 500 FCFA) pour activer votre lien</p>
              </div>
              <ChevronRight className="h-4 w-4 text-amber-500" />
            </button>
          </motion.div>
        )}

        {menuSections.map((section, sIdx) => (
          <motion.div key={section.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + sIdx * 0.05 }}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</p>
            <div className="rounded-2xl bg-card shadow-card divide-y divide-border">
              {section.items.map((item) => (
                <button key={item.label} onClick={() => handleMenuClick(item.label, item.path)} className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><item.icon className="h-5 w-5 text-muted-foreground" /></div>
                  <div className="flex-1"><p className="font-medium text-foreground">{item.label}</p><p className="text-xs text-muted-foreground">{item.desc}</p></div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </motion.div>
        ))}

        <motion.button whileTap={{ scale: 0.98 }} onClick={signOut} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-destructive font-semibold transition-colors hover:bg-destructive/10">
          <LogOut className="h-5 w-5" />Déconnexion
        </motion.button>
        <p className="text-center text-xs text-muted-foreground pb-4">Betesim v1.0.0 · Services winpack</p>
      </div>
      <BottomNav />

      <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
        <DialogContent className="max-w-md max-h-[80vh] rounded-2xl overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" />Notifications</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Accédez à vos notifications via l'icône 🔔 en haut de la page d'accueil.</p>
          <Button variant="outline" className="w-full rounded-xl" onClick={() => { setShowNotifications(false); navigate("/"); }}>Aller à l'accueil</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showSecurity} onOpenChange={setShowSecurity}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5 text-primary" />Changer le mot de passe</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nouveau mot de passe</label>
              <div className="relative">
                <Input type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 6 caractères" className="pr-10 rounded-xl" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Confirmer le mot de passe</label>
              <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Répétez le mot de passe" className="rounded-xl" />
            </div>
            <Button onClick={() => changePasswordMutation.mutate()} disabled={changePasswordMutation.isPending || newPassword.length < 6} className="w-full h-11 rounded-xl gradient-primary text-primary-foreground font-semibold">{changePasswordMutation.isPending ? "Mise à jour..." : "Mettre à jour"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPreferences} onOpenChange={setShowPreferences}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-primary" />Préférences</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-4">
              <div className="flex items-center gap-3">{darkMode ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}<div><p className="font-medium text-foreground">Mode sombre</p><p className="text-xs text-muted-foreground">Changer l'apparence de l'app</p></div></div>
              <Switch checked={darkMode} onCheckedChange={toggleTheme} />
            </div>
            <div className="rounded-xl bg-muted/50 p-4"><p className="font-medium text-foreground">Langue</p><p className="text-xs text-muted-foreground">Français (par défaut)</p></div>
            <div className="rounded-xl bg-muted/50 p-4"><p className="font-medium text-foreground">Version</p><p className="text-xs text-muted-foreground">Betesim v1.0.0</p></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRate} onOpenChange={setShowRate}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Star className="h-5 w-5 text-primary" />Évaluer Betesim</DialogTitle></DialogHeader>
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">Aimez-vous Betesim ? Partagez votre expérience !</p>
            <div className="flex justify-center gap-2">
              {[1,2,3,4,5].map((star) => (<button key={star} onClick={() => { toast.success("Merci ! ⭐"); setShowRate(false); }} className="text-3xl transition-transform hover:scale-125">⭐</button>))}
            </div>
            {isPartner && <ShareButtons referralLink={referralLink} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Compte;
