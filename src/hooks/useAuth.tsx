import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount (handles PKCE exchange too)
    // Do NOT call getSession() separately — it can race against the PKCE code exchange
    // and return null before the token is ready, causing a false redirect to /auth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setLoading(false);

      // Handle referral code for OAuth sign-ups (from URL or localStorage)
      if (_event === "SIGNED_IN" && session?.user) {
        const refCode = new URLSearchParams(window.location.search).get("ref")
          || localStorage.getItem("pending_referral");
        if (refCode) {
          localStorage.removeItem("pending_referral");
          const existingRef = session.user.user_metadata?.referral_code;
          if (!existingRef) {
            await supabase.auth.updateUser({
              data: { referral_code: refCode },
            });
            // Process referral for OAuth signups (trigger missed the code)
            await supabase.rpc("process_late_referral", {
              p_user_id: session.user.id,
              p_referral_code: refCode,
            });
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
