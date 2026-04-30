import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSecurityLayer } from "./lib/security";
import { initTelegramWebApp } from "./lib/telegramWebApp";

initSecurityLayer();
// Bascule l'app en mode Mini App Telegram (plein écran) si chargée dans Telegram.
initTelegramWebApp();
createRoot(document.getElementById("root")!).render(<App />);
