import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AuthCallback = () => {
  const navigate = useNavigate();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const handleCallback = async () => {
      const url = window.location.href;
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(url);
          if (error) {
            console.error("Erreur d'échange de code:", error.message);
            navigate("/auth", { replace: true });
            return;
          }
        } catch (err) {
          console.error("Erreur callback:", err);
          navigate("/auth", { replace: true });
          return;
        }
      }

      // Session established (or already existed), go to home
      navigate("/", { replace: true });
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
        <p className="text-sm text-muted-foreground">Connexion en cours…</p>
      </div>
    </div>
  );
};

export default AuthCallback;