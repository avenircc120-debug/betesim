import { useState } from 'react';
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
import Pronostics from './pages/Pronostics';
import VendeurPage from './pages/VendeurPage';

const queryClient = new QueryClient();

// Détecte si l'app est ouverte dans Telegram WebApp (?tg=1)
const isTelegramWebApp = () =>
  new URLSearchParams(window.location.search).get('tg') === '1' ||
  !!(window as any).Telegram?.WebApp?.initData;

const AppContent = () => {
  const isTG = isTelegramWebApp();

  const [showSplash, setShowSplash] = useState(() => {
    // Jamais de SplashScreen en mode Telegram — interfère avec le WebApp
    if (isTelegramWebApp()) return false;
    const seen = sessionStorage.getItem('betesim-splash-seen');
    return !seen;
  });

  const handleSplashComplete = () => {
    sessionStorage.setItem('betesim-splash-seen', '1');
    setShowSplash(false);
  };

  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileGate>
          {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
          {/* Banners cachés en mode Telegram pour éviter l'effet page-dans-la-page */}
          <InAppNotificationBanner />
          {!isTG && <NotificationPermissionBanner />}
          {!isTG && <InstallBanner />}
          <Toaster />
          <Sonner />

          <Routes>
            <Route path=/ element={<Index />} />
            <Route path=/boutique element={<Boutique />} />
            <Route path=/wallet element={<WalletPage />} />
            <Route path=/historique element={<Historique />} />
            <Route path=/compte element={<Compte />} />
            <Route path=/leaderboard element={<Leaderboard />} />
            <Route path=/faq element={<FAQ />} />
            <Route path=/install element={<Install />} />
            <Route path=/auth/callback element={<AuthCallback />} />
            <Route path=/login element={<LoginPage />} />
            <Route path=/auth element={<LoginPage />} />
            <Route path=/reset-password element={<ResetPassword />} />
            <Route path=/pack-partenaire element={<PackPartenaire />} />
            <Route path=/admin element={<Admin />} />
            <Route path=/onboarding element={<Onboarding />} />
            <Route path=/pronostics element={<Pronostics />} />
            <Route path=/vendeur element={<VendeurPage />} />
            <Route path=* element={<NotFound />} />
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
