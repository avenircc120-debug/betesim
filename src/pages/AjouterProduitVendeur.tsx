/**
 * Page: /add-vendeur
 * ─────────────────────────────────────────────────────────────────────────────
 * Formulaire d'ajout de produit réservé au profil "Vendeur simple".
 * - Standalone (pas d'auth Supabase requise, accessible via Telegram WebApp)
 * - Aucune option Grossiste / Revendeur / Parrainage / Split Payment
 * - Après soumission → notification bot + retour automatique dans Telegram
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useEffect } from "react";
import {
  Package, DollarSign, Hash, FileText, Image,
  CheckCircle, AlertCircle, Loader2, ArrowLeft, ShoppingBag
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTION_URL  = `${SUPABASE_URL}/functions/v1/add-product-vendeur`;
const ANON_KEY      = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function getParam(key: string) {
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

// Retour vers Telegram (deep link)
function backToBot() {
  const botName = import.meta.env.VITE_BOT_USERNAME || "BetesimBot";
  if ((window as any).Telegram?.WebApp?.close) {
    (window as any).Telegram.WebApp.close();
  } else {
    window.location.href = `https://t.me/${botName}`;
  }
}

// ── Composant principal ────────────────────────────────────────────────────
export default function AjouterProduitVendeur() {
  const chatId   = getParam("chatId");
  const vendorId = getParam("vendorId");

  const [name,        setName]        = useState("");
  const [price,       setPrice]       = useState("");
  const [stock,       setStock]       = useState("1");
  const [description, setDescription] = useState("");
  const [photo,       setPhoto]       = useState<File | null>(null);
  const [preview,     setPreview]     = useState<string | null>(null);

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Telegram WebApp theme
  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        tg.BackButton?.show();
        tg.BackButton?.onClick(() => backToBot());
      }
    } catch {}
  }, []);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const numPrice = parseFloat(price.replace(/[^0-9.]/g, ""));
    const numStock = parseInt(stock.replace(/[^0-9]/g, ""), 10);

    if (!name.trim() || name.trim().length < 2) {
      setErrorMsg("Le nom du produit doit faire au moins 2 caractères.");
      return;
    }
    if (isNaN(numPrice) || numPrice <= 0) {
      setErrorMsg("Saisis un prix valide en FCFA.");
      return;
    }
    if (isNaN(numStock) || numStock < 0) {
      setErrorMsg("Le stock doit être 0 ou plus.");
      return;
    }
    if (!chatId || !vendorId) {
      setErrorMsg("Paramètres manquants. Reviens depuis le bot.");
      return;
    }

    setStatus("loading");

    try {
      const fd = new FormData();
      fd.append("chatId",      chatId);
      fd.append("vendorId",    vendorId);
      fd.append("name",        name.trim());
      fd.append("price",       String(numPrice));
      fd.append("stock",       String(numStock));
      if (description.trim()) fd.append("description", description.trim());
      if (photo) fd.append("photo", photo);

      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` },
        body: fd,
      });

      const json = await res.json();
      if (!json.success) {
        setErrorMsg(json.error ?? "Erreur lors de l'enregistrement.");
        setStatus("error");
        return;
      }

      setStatus("success");
      // Retour auto vers le bot après 3 s
      setTimeout(backToBot, 3000);
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur réseau. Réessaie.");
      setStatus("error");
    }
  };

  // ── Écran succès ────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div style={styles.page}>
        <div style={styles.successBox}>
          <CheckCircle size={56} color="#22c55e" style={{ marginBottom: 16 }} />
          <h2 style={styles.successTitle}>Produit ajouté !</h2>
          <p style={styles.successSub}>
            Ton produit est maintenant dans ton stock personnel.
            Tu vas être redirigé vers le bot…
          </p>
          <button style={styles.btnBack} onClick={backToBot}>
            <ArrowLeft size={16} style={{ marginRight: 8 }} />
            Retour au Bot
          </button>
        </div>
      </div>
    );
  }

  // ── Formulaire ──────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <ShoppingBag size={24} color="#a78bfa" />
        <span style={styles.headerTitle}>Ajouter un produit</span>
      </div>
      <p style={styles.headerSub}>
        Ton stock personnel · Aucun grossiste n'y a accès
      </p>

      <form onSubmit={handleSubmit} style={styles.form}>

        {/* Nom */}
        <label style={styles.label}>
          <Package size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Nom du produit *
        </label>
        <input
          style={styles.input}
          type="text"
          placeholder="Ex : Robe en bazin, Chaussures Nike…"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={120}
          required
        />

        {/* Prix */}
        <label style={styles.label}>
          <DollarSign size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Prix de vente (FCFA) *
        </label>
        <input
          style={styles.input}
          type="number"
          placeholder="Ex : 5000"
          value={price}
          onChange={e => setPrice(e.target.value)}
          min="1"
          step="1"
          required
        />

        {/* Stock */}
        <label style={styles.label}>
          <Hash size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Quantité en stock *
        </label>
        <input
          style={styles.input}
          type="number"
          placeholder="Ex : 10"
          value={stock}
          onChange={e => setStock(e.target.value)}
          min="0"
          step="1"
          required
        />

        {/* Description */}
        <label style={styles.label}>
          <FileText size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Description (facultatif)
        </label>
        <textarea
          style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
          placeholder="Taille, couleur, matière, détails…"
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={500}
        />

        {/* Photo */}
        <label style={styles.label}>
          <Image size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Photo (facultatif)
        </label>
        {preview && (
          <img
            src={preview}
            alt="Aperçu"
            style={styles.photoPreview}
          />
        )}
        <button
          type="button"
          style={styles.btnPhoto}
          onClick={() => fileRef.current?.click()}
        >
          {photo ? `📸 ${photo.name.slice(0, 24)}…` : "📷 Choisir une photo"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handlePhoto}
        />

        {/* Erreur */}
        {(status === "error" || errorMsg) && (
          <div style={styles.errorBox}>
            <AlertCircle size={16} style={{ marginRight: 8, flexShrink: 0 }} />
            {errorMsg}
          </div>
        )}

        {/* Bouton submit */}
        <button
          type="submit"
          style={styles.btnSubmit}
          disabled={status === "loading"}
        >
          {status === "loading" ? (
            <><Loader2 size={18} style={{ marginRight: 8, animation: "spin 1s linear infinite" }} />Enregistrement…</>
          ) : (
            <><CheckCircle size={18} style={{ marginRight: 8 }} />Ajouter le produit</>
          )}
        </button>

        <p style={styles.disclaimer}>
          ✅ Ce produit est enregistré dans ton stock personnel uniquement.
          Il n'est pas lié à un grossiste et ne sera pas visible dans les catalogues revendeurs.
        </p>
      </form>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

// ── Styles inline (pas de Tailwind pour page standalone) ──────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f0f1a 0%, #1a1030 100%)",
    color: "#f1f5f9",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "0 0 40px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "20px 20px 4px",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#f1f5f9",
  },
  headerSub: {
    fontSize: 12,
    color: "#94a3b8",
    margin: "0 0 20px 20px",
  },
  form: {
    padding: "0 16px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#c4b5fd",
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    background: "#1e1b4b",
    border: "1px solid #3730a3",
    borderRadius: 12,
    color: "#f1f5f9",
    fontSize: 15,
    outline: "none",
  },
  photoPreview: {
    width: "100%",
    maxHeight: 200,
    objectFit: "cover",
    borderRadius: 12,
    marginBottom: 8,
    border: "1px solid #3730a3",
  },
  btnPhoto: {
    width: "100%",
    padding: "11px 14px",
    background: "#1e1b4b",
    border: "1px dashed #7c3aed",
    borderRadius: 12,
    color: "#a78bfa",
    fontSize: 14,
    cursor: "pointer",
    textAlign: "left",
  },
  errorBox: {
    display: "flex",
    alignItems: "flex-start",
    background: "#450a0a",
    border: "1px solid #991b1b",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    color: "#fca5a5",
    marginTop: 8,
  },
  btnSubmit: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "14px",
    marginTop: 16,
    background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
    border: "none",
    borderRadius: 14,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
  },
  disclaimer: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 1.5,
  },
  // Écran succès
  successBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 32,
    textAlign: "center",
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 800,
    color: "#22c55e",
    marginBottom: 10,
  },
  successSub: {
    fontSize: 15,
    color: "#94a3b8",
    lineHeight: 1.6,
    marginBottom: 24,
  },
  btnBack: {
    display: "flex",
    alignItems: "center",
    padding: "12px 24px",
    background: "#1e1b4b",
    border: "1px solid #3730a3",
    borderRadius: 12,
    color: "#a78bfa",
    fontSize: 15,
    cursor: "pointer",
  },
};
