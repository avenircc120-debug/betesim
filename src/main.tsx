import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSecurityLayer } from "./lib/security";

initSecurityLayer();
createRoot(document.getElementById("root")!).render(<App />);
