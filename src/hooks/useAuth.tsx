import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type NormalizedUser = {
  uid: string;
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
};

function normalizeUser(u: User): NormalizedUser {
  const meta = u.user_metadata ?? {};
  const displayName =
    meta.display_name ||
    meta.full_name ||
    [meta.first_name, meta.last_name].filter(Boolean).join(" ") ||
    null;
  return {
    uid: u.id,
    id: u.id,
    email: u.email ?? null,
    displayName,
    photoURL: meta.avatar_url ?? null,
    phoneNumber: u.phone ?? meta.phone ?? null,
  };
}

interface AuthContextType {
  user: NormalizedUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  showAuthModal: (message?: string) => void;
  requireAuth: (action: () => void) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  showAuthModal: () => {},
  requireAuth: () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<NormalizedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Récupère la session existante au démarrage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ? normalizeUser(session.user) : null);
      setLoading(false);
    });

    // Écoute les changements d'état auth (connexion, déconnexion, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? normalizeUser(session.user) : null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const goToLogin = useCallback(() => {
    const from = location.pathname + location.search;
    navigate(`/login`, { state: { from } });
  }, [navigate, location]);

  const showAuthModal = useCallback(() => {
    goToLogin();
  }, [goToLogin]);

  const requireAuth = useCallback(
    (action: () => void) => {
      if (user) action();
      else goToLogin();
    },
    [user, goToLogin]
  );

  return (
    <AuthContext.Provider value={{ user, loading, signOut, showAuthModal, requireAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
