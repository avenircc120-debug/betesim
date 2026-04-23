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
  authProvider: "google" | "phone";
};

function normalizeFirebaseUser(firebaseUser: User): NormalizedUser {
  return {
    uid: firebaseUser.uid,
    id: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    phoneNumber: firebaseUser.phoneNumber,
    authProvider: "google",
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
    authProvider: "phone",
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
  const navigate = useNavigate();
  const location = useLocation();

  // Active user: Firebase (Google) takes priority over Supabase (phone)
  const user = firebaseUser ?? supabaseUser ?? null;

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
    let firebaseLoaded = false;
    let supabaseLoaded = false;

    const checkBothLoaded = () => {
      if (firebaseLoaded && supabaseLoaded) setLoading(false);
    };

    // Firebase listener — Google auth
    const firebaseUnsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const normalized = normalizeFirebaseUser(fbUser);
        setFirebaseUser(normalized);
        ensureProfile(normalized);
      } else {
        setFirebaseUser(null);
      }
      firebaseLoaded = true;
      checkBothLoaded();
    });

    // Supabase listener — Phone auth
    const { data: { subscription: supabaseSub } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          const normalized = normalizeSupabaseSession(session);
          setSupabaseUser(normalized);
          ensureProfile(normalized);
        } else {
          setSupabaseUser(null);
        }
        supabaseLoaded = true;
        checkBothLoaded();
      }
    );

    return () => {
      firebaseUnsub();
      supabaseSub.unsubscribe();
    };
  }, [ensureProfile]);

  const signOut = useCallback(async () => {
    await Promise.allSettled([
      signOutUser(),
      supabase.auth.signOut(),
    ]);
    setFirebaseUser(null);
    setSupabaseUser(null);
  }, []);

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
