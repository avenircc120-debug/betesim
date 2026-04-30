/**
 * Couche d'immersion Telegram Mini App.
 *
 * Quand l'application est ouverte depuis Telegram (lien promo, bouton menu du
 * bot, ou bouton Web App d'un message), on bascule en mode plein écran et on
 * route TOUS les liens externes via les API Telegram pour ne JAMAIS quitter
 * l'application Telegram (pas de Chrome, pas de Samsung Internet, etc.).
 */

declare global {
  interface Window {
    Telegram?: {
      WebApp?: any;
    };
  }
}

const tg = () => window.Telegram?.WebApp;

/** Vrai si la page tourne actuellement à l'intérieur de Telegram. */
export function isTelegramWebApp(): boolean {
  const w = tg();
  // initData non vide ⇒ vraie session Telegram (pas un simple chargement du SDK)
  return !!w && (typeof w.initData === "string" ? w.initData.length > 0 : !!w.platform);
}

/**
 * Initialisation globale (à appeler une seule fois, au démarrage de l'app).
 * - Marque la WebApp prête
 * - Étend en plein écran (expanded)
 * - Demande le vrai fullscreen si supporté (Bot API ≥ 8.0)
 * - Bloque le swipe-down qui ferme la fenêtre par accident
 * - Confirme avant fermeture
 * - Aligne le thème (header) sur l'app
 */
export function initTelegramWebApp(): void {
  const w = tg();
  if (!w) return;
  try {
    w.ready?.();
    w.expand?.();
    if (typeof w.requestFullscreen === "function") {
      try { w.requestFullscreen(); } catch { /* ignore on older clients */ }
    }
    if (typeof w.disableVerticalSwipes === "function") w.disableVerticalSwipes();
    if (typeof w.enableClosingConfirmation === "function") w.enableClosingConfirmation();
    // Marquer le <html> pour permettre au CSS d'adapter la mise en page si besoin
    document.documentElement.setAttribute("data-tg-webapp", "1");
  } catch (e) {
    console.warn("[telegramWebApp] init failed:", e);
  }
}

/**
 * Ouvre un lien EXTERNE (1win, Vercel, etc.) :
 * - dans Telegram → utilise openLink() qui garde l'utilisateur dans Telegram
 *   (ouverture dans le mini-navigateur intégré, pas Chrome/Samsung)
 * - hors Telegram → ouverture classique dans un nouvel onglet
 */
export function openExternal(url: string, opts: { tryInstantView?: boolean } = {}): void {
  const w = tg();
  if (w && typeof w.openLink === "function") {
    try {
      w.openLink(url, { try_instant_view: !!opts.tryInstantView });
      return;
    } catch (e) {
      console.warn("[telegramWebApp] openLink failed, falling back:", e);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Ouvre un lien TELEGRAM (t.me/...) :
 * - dans Telegram → openTelegramLink() bascule directement dans le bot/canal
 * - hors Telegram → ouverture classique
 */
export function openTelegramLink(url: string): void {
  const w = tg();
  if (w && typeof w.openTelegramLink === "function") {
    try {
      w.openTelegramLink(url);
      return;
    } catch (e) {
      console.warn("[telegramWebApp] openTelegramLink failed, falling back:", e);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Petit feedback haptique (optionnel, agréable sur mobile). */
export function haptic(type: "success" | "warning" | "error" | "light" = "light"): void {
  const w = tg();
  if (!w?.HapticFeedback) return;
  try {
    if (type === "success" || type === "warning" || type === "error") {
      w.HapticFeedback.notificationOccurred(type);
    } else {
      w.HapticFeedback.impactOccurred(type);
    }
  } catch { /* noop */ }
}
