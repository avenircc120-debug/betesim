import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, onAuthStateChanged, signOutUser, type User } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type NormalizedUser = {
  uid: string;
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
};

function normalizeUser(firebaseUser: User): NormalizedUser {
  return {
    uid: firebaseUser.uid,
    id: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    phoneNumber: firebaseUser.phoneNumber,
  };
}

function normalizeSupabaseSession(session: Session): NormalizedUser {
  const u = session.user;
  return {
    uid: u.id,
    id: u.id,
    email: u.email ?? null,
    displayName: u.user_metadata?.display_name ?? null,
    photoURL: u.user_metadata?.avatar_url ?? null,
    phoneNumber: u.phone ?? null,
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
  const [firebaseUser, setFirebaseUser] = useState<NormalizedUser | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<NormalizedUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Google (Firebase) prioritaire sur phone (Supabase)
  const user = firebaseUser ?? supabaseUser ?? null;
  const navigate = useNavigate();
  const location = useLocation();

  const ensureProfile = useCallback((normalized: NormalizedUser) => {
    supabase.functions.invoke("ensure-profile", {
      body: {
        user_id: normalized.uid,
        email: normalized.email,
        display_name: normalized.displayName,
        photo_url: normalized.photoURL,
        phone_number: normalized.phoneNumber,
      },
    }).catch((e) => console.warn("ensure-profile failed:", e));
  }, []);

  useEffect(() => {
    let fbLoaded = false;
    let sbLoaded = false;
    const checkLoaded = () => { if (fbLoaded && sbLoaded) setLoading(false); };

    // Listener Firebase — Google auth
    const fbUnsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const n = normalizeUser(fbUser);
        setFirebaseUser(n);
        ensureProfile(n);
      } else {
        setFirebaseUser(null);
      }
      fbLoaded = true;
      checkLoaded();
    });

    // Listener Supabase — Phone OTP auth
    const { data: { subscription: sbSub } } = supabase.auth.onAuthStateChange((_ev, session) => {
      if (session?.user) {
        const n = normalizeSupabaseSession(session);
        setSupabaseUser(n);
        ensureProfile(n);
      } else {
        setSupabaseUser(null);
      }
      sbLoaded = true;
      checkLoaded();
    });

    return () => { fbUnsub(); sbSub.unsubscribe(); };
  }, [ensureProfile]);

  const signOut = async () => {
    await Promise.allSettled([signOutUser(), supabase.auth.signOut()]);
    setFirebaseUser(null);
    setSupabaseUser(null);
  };

  const goToLogin = useCallback(() => {
    const from = location.pathname + location.search;
    navigate(`/login?redirect=${encodeURIComponent(from)}`);
  }, [navigate, location]);

  const showAuthModal = useCallback(() => {
    goToLogin();
  }, [goToLogin]);

  const requireAuth = useCallback((action: () => void) => {
    if (user) {
      action();
    } else {
      goToLogin();
    }
  }, [user, goToLogin]);

  return (
    <AuthContext.Provider value={{ user, loading, signOut, showAuthModal, requireAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
