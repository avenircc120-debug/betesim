import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ShieldCheck, Mail, KeyRound,
  CheckCircle2, XCircle, ArrowRight, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";

const FORM_OPENED_KEY = (packId: string) => `gmail_2fa_form_opened_${packId}`;
const VALIDATION_KEY = (packId: string) => `gmail_2fa_validation_${packId}`;
const AI_MSG_CACHE_KEY = (packId: string) => `gmail_2fa_ai_msg_${packId}`;

type Validation = "yes" | "no" | null;

interface AiMessage {
  intro: string;
  explanation: string;
  callToAction: string;
  mirrorTip: string;
  securityReminder: string;
}

const FALLBACK: AiMessage = {
  intro:
    "Pour sécuriser ton compte, utilise simplement l'adresse Gmail qui est déjà dans ton téléphone.",
  explanation:
    "📱 C'est ton Gmail principal, celui que tu utilises pour tout. En mettant celui-là, tu es sûr de ne jamais perdre l'accès à tes gains, même si tu changes de téléphone ou si tu réinitialises ton Samsung.",
  callToAction:
    "👇 Clique sur le bouton pour ouvrir le formulaire, tape tes 8 caractères et ton Gmail habituel pour valider définitivement ton compte de récupération.",
  mirrorTip:
    "Astuce miroir : utilise le même Gmail que celui de ton Play Store / téléphone. N'en crée surtout pas un nouveau, tu risquerais de l'oublier.",
  securityReminder:
    "Ton Gmail et ton code de 8 caractères sont tes deux clés secrètes. Garde-les bien.",
};

/**
 * Guidage IA pour la mise en place du Gmail de récupération 2FA.
 *
 * Le contenu est généré côté serveur par Groq via l'edge function
 * `ai-guide-2fa`. La réponse est mise en cache en localStorage pour rester
 * stable et instantanée aux ré-affichages (même hors-ligne / Groq down).
 *
 * Pédagogie miroir : utiliser le Gmail déjà configuré sur le téléphone
 * (Play Store) pour ne jamais perdre l'accès à son compte.
 *
 * Action : bouton « Ouvrir le formulaire » → tg://settings/2fa
 * Validation : OUI / NON après retour, persistés en localStorage.
 */
interface Gmail2FAGuideProps {
  packId: string;
}

const Gmail2FAGuide = ({ packId }: Gmail2FAGuideProps) => {
  const { data: profile } = useProfile();
  const [aiMsg, setAiMsg] = useState<AiMessage | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(true);
  const [formOpened, setFormOpened] = useState<boolean>(false);
  const [validation, setValidation] = useState<Validation>(null);
  const awaitingFormReturnRef = useRef<boolean>(false);
  const sawHiddenSinceFormRef = useRef<boolean>(false);

  // Restauration depuis localStorage
  useEffect(() => {
    try {
      if (localStorage.getItem(FORM_OPENED_KEY(packId)) === "1") {
        setFormOpened(true);
      }
      const stored = localStorage.getItem(VALIDATION_KEY(packId));
      if (stored === "yes" || stored === "no") {
        setValidation(stored);
      }
      const cached = localStorage.getItem(AI_MSG_CACHE_KEY(packId));
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.intro === "string") {
          setAiMsg(parsed);
          setAiLoading(false);
        }
      }
    } catch { /* noop */ }
  }, [packId]);

  // Récupération du message IA via l'edge function (une seule fois par pack)
  useEffect(() => {
    let cancelled = false;
    if (aiMsg) return; // déjà en cache → rien à faire

    const firstName =
      ((profile as any)?.first_name as string | undefined) ||
      ((profile as any)?.full_name as string | undefined)?.split(" ")[0] ||
      undefined;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("ai-guide-2fa", {
          body: { firstName },
        });
        if (cancelled) return;
        if (error) throw error;
        const msg = (data?.message as AiMessage) || FALLBACK;
        setAiMsg(msg);
        try { localStorage.setItem(AI_MSG_CACHE_KEY(packId), JSON.stringify(msg)); } catch { /* noop */ }
      } catch (e) {
        if (cancelled) return;
        // En cas d'erreur réseau, on affiche le fallback sans bloquer l'UX
        setAiMsg(FALLBACK);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [packId, aiMsg, profile]);

  // Détection du retour depuis le formulaire Telegram (visibilitychange)
  useEffect(() => {
    const onVisibility = () => {
      if (!awaitingFormReturnRef.current) return;
      if (document.hidden) {
        sawHiddenSinceFormRef.current = true;
      } else if (sawHiddenSinceFormRef.current) {
        awaitingFormReturnRef.current = false;
        sawHiddenSinceFormRef.current = false;
        try { localStorage.setItem(FORM_OPENED_KEY(packId), "1"); } catch { /* noop */ }
        setFormOpened(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [packId]);

  const openForm = () => {
    awaitingFormReturnRef.current = true;
    sawHiddenSinceFormRef.current = false;
    // tg://settings/2fa : pris en charge directement par l'OS / Telegram
    // (les API openLink/openTelegramLink ne gèrent pas le schéma tg://)
    window.location.href = "tg://settings/2fa";
  };

  const setValid = (v: "yes" | "no") => {
    try { localStorage.setItem(VALIDATION_KEY(packId), v); } catch { /* noop */ }
    setValidation(v);
  };

  const msg = aiMsg ?? FALLBACK;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="rounded-2xl bg-gradient-to-br from-indigo-500/10 via-card to-violet-500/10 border-2 border-indigo-400/30 p-5 shadow-glow space-y-4"
    >
      {/* En-tête « Assistant IA » */}
      <div className="flex items-center gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glow">
          <Sparkles className="h-5 w-5 text-white" />
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 border-2 border-card">
            <span className="block h-1.5 w-1.5 rounded-full bg-white" />
          </span>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Assistant IA · Sécurisation
          </p>
          <p className="font-bold text-foreground text-sm">
            Configure ton Gmail de récupération
          </p>
        </div>
      </div>

      {/* Bulle de message IA */}
      <div className="rounded-xl bg-background/80 backdrop-blur p-4 border border-indigo-200/40 dark:border-indigo-900/40 space-y-3 min-h-[120px]">
        {aiLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
            <span>L'assistant IA prépare ton message…</span>
          </div>
        ) : (
          <>
            <p className="text-sm text-foreground leading-relaxed">{msg.intro}</p>
            <p className="text-sm text-foreground leading-relaxed">{msg.explanation}</p>
            <p className="text-sm text-foreground leading-relaxed">{msg.callToAction}</p>
          </>
        )}
      </div>

      {/* Astuce « miroir » */}
      <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3 flex items-start gap-2">
        <Mail className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          <strong>Astuce miroir&nbsp;:</strong>{" "}
          {aiLoading ? FALLBACK.mirrorTip : msg.mirrorTip}
        </p>
      </div>

      {/* Bouton ouvrir le formulaire */}
      <Button
        onClick={openForm}
        className="h-12 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:opacity-90 text-white font-bold shadow-glow"
      >
        <KeyRound className="h-4 w-4 mr-2" />
        Ouvrir le formulaire 2FA
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>

      {/* Rappel de sécurité */}
      <div className="rounded-xl bg-background/60 border border-border p-3 flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Rappel&nbsp;:</strong>{" "}
          {aiLoading ? FALLBACK.securityReminder : msg.securityReminder}
        </p>
      </div>

      {/* Validation après retour du formulaire */}
      <AnimatePresence mode="wait">
        {formOpened && validation === null && (
          <motion.div
            key="validate"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl bg-card border-2 border-indigo-400/30 p-4 space-y-3"
          >
            <p className="text-sm font-bold text-foreground text-center">
              As-tu bien validé ton Gmail de récupération&nbsp;?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => setValid("yes")}
                className="h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                OUI
              </Button>
              <Button
                onClick={() => setValid("no")}
                variant="outline"
                className="h-12 rounded-xl border-2 font-bold"
              >
                <XCircle className="h-4 w-4 mr-2" />
                NON
              </Button>
            </div>
          </motion.div>
        )}

        {validation === "yes" && (
          <motion.div
            key="ok"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl bg-emerald-500/10 border border-emerald-400/40 p-4 flex items-center gap-3"
          >
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-foreground text-sm">
                Compte de récupération validé ✓
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ton Gmail est désormais enregistré comme méthode de récupération définitive.
              </p>
            </div>
          </motion.div>
        )}

        {validation === "no" && (
          <motion.div
            key="retry"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl bg-rose-500/10 border border-rose-400/40 p-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              <XCircle className="h-6 w-6 text-rose-600 shrink-0" />
              <div>
                <p className="font-bold text-foreground text-sm">
                  Pas de souci, on recommence
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Rouvre le formulaire et saisis ton Gmail habituel + tes 8 caractères, puis revalide.
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                try { localStorage.removeItem(VALIDATION_KEY(packId)); } catch { /* noop */ }
                setValidation(null);
                openForm();
              }}
              className="h-11 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:opacity-90 text-white font-bold"
            >
              <KeyRound className="h-4 w-4 mr-2" />
              Rouvrir le formulaire
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Gmail2FAGuide;
