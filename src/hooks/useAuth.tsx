import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, onAuthStateChanged, signOutUser, type User } from "@/lib/firebase";

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
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? normalizeUser(firebaseUser) : null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signOut = async () => {
    await signOutUser();
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
