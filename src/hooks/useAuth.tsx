import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
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

interface AuthProviderProps {
  children: ReactNode;
  onShowModal: (message?: string) => void;
}

export const AuthProvider = ({ children, onShowModal }: AuthProviderProps) => {
  const [user, setUser] = useState<NormalizedUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  const showAuthModal = useCallback((message?: string) => {
    onShowModal(message);
  }, [onShowModal]);

  const requireAuth = useCallback((action: () => void) => {
    if (user) {
      action();
    } else {
      onShowModal();
    }
  }, [user, onShowModal]);

  return (
    <AuthContext.Provider value={{ user, loading, signOut, showAuthModal, requireAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
