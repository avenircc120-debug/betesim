import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const SUPABASE_FN = import.meta.env.VITE_SUPABASE_URL?.replace("/rest/v1", "").replace("https://", "https://") + "";
const fnUrl = (name: string) => `${import.meta.env.VITE_SUPABASE_URL?.split("/rest")[0]}/functions/v1/${name}`;

export default function InscriptionRevendeur() {
  const params = new URLSearchParams(window.location.search);
  const chatId = params.get("chatId") || "";
  const wholesalerId = params.get("wholesalerId") || "";

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [wholesaler, setWholesaler] = useState<{ shop_name: string } | null>(null);

  useEffect(() => {
    if (!chatId) return;
    supabase
      .from("lv_resellers")
      .select("id")
      .eq("telegram_chat_id", Number(chatId))
      .maybeSingle()
      .then(({ data }) => {
        if (data) setDone(true);
      });
    if (wholesalerId) {
      supabase
        .from("lv_wholesalers")
        .select("shop_name")
        .eq("id", wholesalerId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setWholesaler(data);
        });
    }
  }, [chatId, wholesalerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!chatId) { setError("chatId manquant dans l'URL"); return; }
    if (!fullName.trim()) { setError("Le nom est obligatoire"); return; }

    setLoading(true);
    try {
      const res = await fetch(fnUrl("register-reseller"), {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ chatId, fullName, phone, shopName, description, wholesalerId: wholesalerId || undefined }),
      });
      const data = await res.json();
      if (!data.success) {
        if (data.error?.includes("déjà existant")) { setDone(true); return; }
        setError(data.error || "Erreur lors de l'inscription");
      } else {
        setDone(true);
      }
    } catch (err: any) {
      setError(err?.message || "Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  if (!chatId) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.errorIcon}>❌</div>
          <h2 style={styles.title}>Lien invalide</h2>
          <p style={styles.sub}>Ce lien doit être ouvert depuis le bot Telegram Livrauto.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.successIcon}>✅</div>
          <h2 style={styles.title}>Profil créé !</h2>
          <p style={styles.sub}>
            Ton profil revendeur a été enregistré avec succès.
          </p>
          <p style={styles.sub}>
            Retourne sur le bot Telegram et tape <strong>/start</strong> pour accéder à ton dashboard.
          </p>
          <a href={`https://t.me/livrauto_bot?start=dashboard`} style={styles.btn}>
            🚀 Retour au bot
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.logo}>📦</div>
        <h1 style={styles.title}>Devenir Revendeur</h1>
        {wholesaler && (
          <p style={styles.badge}>
            🏗️ Rejoindre : <strong>{wholesaler.shop_name}</strong>
          </p>
        )}
        <p style={styles.sub}>Remplis ce formulaire pour créer ton profil revendeur Livrauto.</p>

        <form onSubmit={submit} style={styles.form}>
          <label style={styles.label}>Nom complet *</label>
          <input
            style={styles.input}
            type="text"
            placeholder="Ex : Kouassi Amos"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            maxLength={100}
          />

          <label style={styles.label}>Téléphone</label>
          <input
            style={styles.input}
            type="tel"
            placeholder="Ex : +225 07 00 00 00 00"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            maxLength={20}
          />

          <label style={styles.label}>Nom de ta boutique</label>
          <input
            style={styles.input}
            type="text"
            placeholder="Ex : Boutique Amos Store"
            value={shopName}
            onChange={e => setShopName(e.target.value)}
            maxLength={100}
          />

          <label style={styles.label}>Description (optionnel)</label>
          <textarea
            style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
            placeholder="Décris ta boutique en quelques mots..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={500}
          />

          {error && <p style={styles.errorMsg}>⚠️ {error}</p>}

          <button type="submit" style={loading ? styles.btnDisabled : styles.btn} disabled={loading}>
            {loading ? "Inscription en cours..." : "✅ Créer mon profil revendeur"}
          </button>
        </form>

        <p style={styles.footer}>
          Après validation, retourne sur le bot Telegram et tape <strong>/start</strong>.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  card: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 20,
    padding: "36px 28px",
    width: "100%",
    maxWidth: 480,
    backdropFilter: "blur(10px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  },
  logo: { fontSize: 48, textAlign: "center", marginBottom: 12 },
  successIcon: { fontSize: 64, textAlign: "center", marginBottom: 12 },
  errorIcon: { fontSize: 64, textAlign: "center", marginBottom: 12 },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: 700,
    textAlign: "center",
    margin: "0 0 8px",
  },
  badge: {
    background: "rgba(99,102,241,0.15)",
    border: "1px solid rgba(99,102,241,0.4)",
    borderRadius: 8,
    color: "#a5b4fc",
    fontSize: 14,
    textAlign: "center",
    padding: "6px 12px",
    marginBottom: 12,
  },
  sub: {
    color: "#9ca3af",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 1.6,
  },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  label: { color: "#d1d5db", fontSize: 13, fontWeight: 500, marginBottom: 2 },
  input: {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 10,
    color: "#fff",
    fontSize: 15,
    padding: "12px 14px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  btn: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "14px 20px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
    textDecoration: "none",
    display: "block",
    marginTop: 8,
  },
  btnDisabled: {
    background: "#374151",
    color: "#9ca3af",
    border: "none",
    borderRadius: 12,
    padding: "14px 20px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "not-allowed",
    textAlign: "center",
    display: "block",
    marginTop: 8,
  },
  errorMsg: { color: "#f87171", fontSize: 13, textAlign: "center" },
  footer: { color: "#6b7280", fontSize: 12, textAlign: "center", marginTop: 20, lineHeight: 1.6 },
};
