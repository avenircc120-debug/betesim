import { ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

// Routes accessibles SANS profil complet
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/auth/callback",
  "/reset-password",
  "/onboarding",
  "/install",
];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

interface Props { children: ReactNode }

const ProfileGate = ({ children }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!user) return; // utilisateur invité : la page gérera elle-même la redirection
    if (profileLoading) return;
    if (!profile) return;

    const p: any = profile;
    const incomplete = !p.full_name || !p.deposit_number || !p.withdrawal_number;

    if (incomplete && !isPublic(location.pathname)) {
      const redirect = location.pathname + location.search;
      navigate(`/onboarding?redirect=${encodeURIComponent(redirect)}`, { replace: true });
    }
  }, [user, authLoading, profile, profileLoading, location.pathname, location.search, navigate]);

  return <>{children}</>;
};

export default ProfileGate;
