import { useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AuthModal } from "@/components/AuthModal";
import SplashScreen from "@/components/SplashScreen";
import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";
import InAppNotificationBanner from "@/components/InAppNotificationBanner";
import InstallBanner from "@/components/InstallBanner";
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

const queryClient = new QueryClient();

const AppContent = () => {
  const [showSplash, setShowSplash] = useState(() => {
    const seen = sessionStorage.getItem("betesim-splash-seen");
    return !seen;
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState<string | undefined>();

  const handleSplashComplete = () => {
    sessionStorage.setItem("betesim-splash-seen", "1");
    setShowSplash(false);
  };

  const handleShowModal = useCallback((message?: string) => {
    setAuthModalMessage(message ?? "Veuillez vous connecter pour continuer.");
    setAuthModalOpen(true);
  }, []);

  return (
    <AuthProvider onShowModal={handleShowModal}>
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
      <InAppNotificationBanner />
      <NotificationPermissionBanner />
      <InstallBanner />
      <Toaster />
      <Sonner />

      <AuthModal
        open={authModalOpen}
        message={authModalMessage}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => setAuthModalOpen(false)}
      />

      <BrowserRouter>
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
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
