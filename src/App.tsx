import { useState, Component, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import SplashScreen from "@/components/SplashScreen";
import InAppNotificationBanner from "@/components/InAppNotificationBanner";
import Boutique from "./pages/Boutique";
import WalletPage from "./pages/WalletPage";
import Historique from "./pages/Historique";
import Profil from "./pages/Profil";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import LoginPage from "./pages/LoginPage";
import Onboarding from "./pages/Onboarding";
import ResetPassword from "./pages/ResetPassword";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

interface EBState { error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", background: "#111", color: "#f87171", minHeight: "100vh" }}>
          <h2 style={{ color: "#fbbf24", marginBottom: 12 }}>⚠️ Erreur Betesim</h2>
          <p style={{ marginBottom: 8, color: "#fff" }}>{this.state.error.message}</p>
          <pre style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "pre-wrap" }}>{this.state.error.stack}</pre>
          <button onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: "8px 16px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppLayout = ({ showSplash, onSplashComplete }: {
  showSplash: boolean;
  onSplashComplete: () => void;
}) => (
  <AuthProvider>
    {showSplash && <SplashScreen onComplete={onSplashComplete} />}
    <InAppNotificationBanner />
    <Routes>
      <Route path="/" element={<Navigate to="/accueil" replace />} />
      <Route path="/accueil"   element={<Boutique />} />
      <Route path="/numeros"   element={<Historique />} />
      <Route path="/recharger" element={<WalletPage />} />
      <Route path="/profil"    element={<Profil />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </AuthProvider>
);

function App() {
  const [showSplash, setShowSplash] = useState(true);
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            {/* Toasters au niveau global — visibles sur TOUTES les routes */}
            <Toaster />
            <Sonner />
            <Routes>
              <Route path="/login"          element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding"     element={<Onboarding />} />
              <Route path="*" element={
                <AppLayout
                  showSplash={showSplash}
                  onSplashComplete={() => setShowSplash(false)}
                />
              } />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
