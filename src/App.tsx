import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import SplashScreen from "@/components/SplashScreen";
import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";
import InAppNotificationBanner from "@/components/InAppNotificationBanner";
import InstallBanner from "@/components/InstallBanner";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Machine from "./pages/Machine";
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

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    const refCode = new URLSearchParams(location.search).get("ref");
    if (refCode) {
      localStorage.setItem("pending_referral", refCode);
    }
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppContent = () => {
  const [showSplash, setShowSplash] = useState(() => {
    const seen = sessionStorage.getItem("pi-splash-seen");
    return !seen;
  });

  const handleSplashComplete = () => {
    sessionStorage.setItem("pi-splash-seen", "1");
    setShowSplash(false);
  };

  return (
    <>
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
      <InAppNotificationBanner />
      <NotificationPermissionBanner />
      <InstallBanner />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
          <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/machine" element={<ProtectedRoute><Machine /></ProtectedRoute>} />
          <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
          <Route path="/historique" element={<ProtectedRoute><Historique /></ProtectedRoute>} />
          <Route path="/compte" element={<ProtectedRoute><Compte /></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
          <Route path="/faq" element={<ProtectedRoute><FAQ /></ProtectedRoute>} />
          <Route path="/install" element={<Install />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
