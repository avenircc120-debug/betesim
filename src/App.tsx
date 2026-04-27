import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import SplashScreen from "@/components/SplashScreen";
import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";
import InAppNotificationBanner from "@/components/InAppNotificationBanner";
import InstallBanner from "@/components/InstallBanner";
import ProfileGate from "@/components/ProfileGate";
import Index from "./pages/Index";
import ResetPassword from "./pages/ResetPassword";
import Boutique from "./pages/Boutique";
import WalletPage from "./pages/WalletPage";
import Historique from "./pages/Historique";
import Compte from "./pages/Compte";
import Leaderboard from "./pages/Leaderboard";
import FAQ from "./pages/FAQ";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import LoginPage from "./pages/LoginPage";
import PackPartenaire from "./pages/PackPartenaire";
import Admin from "./pages/Admin";
import Onboarding from "./pages/Onboarding";

const queryClient = new QueryClient();

const AppContent = () => {
  const [showSplash, setShowSplash] = useState(() => {
    const seen = sessionStorage.getItem("betesim-splash-seen");
    return !seen;
  });

  const handleSplashComplete = () => {
    sessionStorage.setItem("betesim-splash-seen", "1");
    setShowSplash(false);
  };

  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileGate>
          {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
          <InAppNotificationBanner />
          <NotificationPermissionBanner />
          <InstallBanner />
          <Toaster />
          <Sonner />

          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/boutique" element={<Boutique />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/historique" element={<Historique />} />
            <Route path="/compte" element={<Compte />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/install" element={<Install />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/pack-partenaire" element={<PackPartenaire />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ProfileGate>
      </AuthProvider>
    </BrowserRouter>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppContent />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
