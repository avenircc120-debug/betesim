import { useState, Component, ReactNode } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import SplashScreen from '@/components/SplashScreen';
import NotificationPermissionBanner from '@/components/NotificationPermissionBanner';
import InAppNotificationBanner from '@/components/InAppNotificationBanner';
import InstallBanner from '@/components/InstallBanner';
import ProfileGate from '@/components/ProfileGate';
import Index from './pages/Index';
import ResetPassword from './pages/ResetPassword';
import Boutique from './pages/Boutique';
import WalletPage from './pages/WalletPage';
import Historique from './pages/Historique';
import Compte from './pages/Compte';
import Leaderboard from './pages/Leaderboard';
import FAQ from './pages/FAQ';
import Install from './pages/Install';
import NotFound from './pages/NotFound';
import AuthCallback from './pages/AuthCallback';
import LoginPage from './pages/LoginPage';
import PackPartenaire from './pages/PackPartenaire';
import Admin from './pages/Admin';
import Onboarding from './pages/Onboarding';
import VendeurPage from './pages/VendeurPage';
import RevendeurDashboard from './pages/RevendeurDashboard';
import Marketplace from './pages/Marketplace';
import AjouterProduit from './pages/Pronostics';
import Vitrine from './pages/Vitrine';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const isTelegramWebApp = () => {
  try {
    if (new URLSearchParams(window.location.search).get('tg') === '1') return true;
    const tg = (window as any).Telegram?.WebApp;
    return !!(tg && tg.initData && tg.initData.length > 0);
  } catch {
    return false;
  }
};

interface EBState { error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', background: '#111', color: '#f87171', minHeight: '100vh' }}>
          <h2 style={{ color: '#fbbf24', marginBottom: 12 }}>⚠️ Erreur Betesim</h2>
          <p style={{ marginBottom: 8, color: '#fff' }}>{this.state.error.message}</p>
          <pre style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'pre-wrap' }}>{this.state.error.stack}</pre>
          <button onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AuthenticatedLayout = ({ isTG, showSplash, onSplashComplete }: {
  isTG: boolean;
  showSplash: boolean;
  onSplashComplete: () => void;
}) => (
  <AuthProvider>
    <ProfileGate>
      {showSplash && <SplashScreen onComplete={onSplashComplete} />}
      <InAppNotificationBanner />
      {!isTG && <NotificationPermissionBanner />}
      {!isTG && <InstallBanner />}
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
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/dashboard-revendeur" element={<RevendeurDashboard />} />
        <Route path="/vendeur" element={<VendeurPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ProfileGate>
  </AuthProvider>
);

const AppContent = () => {
  const isTG = isTelegramWebApp();

  const [showSplash, setShowSplash] = useState(() => {
    if (isTelegramWebApp()) return false;
    try { return !sessionStorage.getItem('betesim-splash-seen'); } catch { return false; }
  });

  const handleSplashComplete = () => {
    try { sessionStorage.setItem('betesim-splash-seen', '1'); } catch {}
    setShowSplash(false);
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* ── Pages standalone — accessibles sans authentification ── */}
        <Route path="/ajouter-produit" element={<AjouterProduit />} />
        <Route path="/vitrine"         element={<Vitrine />} />

        {/* ── Reste de l'app avec authentification ── */}
        <Route path="*" element={
          <AuthenticatedLayout
            isTG={isTG}
            showSplash={showSplash}
            onSplashComplete={handleSplashComplete}
          />
        } />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
