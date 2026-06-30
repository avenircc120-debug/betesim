import { useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Package, ArrowLeft, CheckCircle, Upload, X, AlertCircle } from "lucide-react";

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Status = "idle" | "loading" | "success" | "error";

export default function AjouterProduit() {
  const [params] = useSearchParams();
  const chatId      = params.get("chatId");
  const wholesalerId = params.get("wholesalerId");

  const [name, setName]             = useState("");
  const [price, setPrice]           = useState("");
  const [stock, setStock]           = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage]           = useState<File | null>(null);
  const [preview, setPreview]       = useState<string | null>(null);
  const [status, setStatus]         = useState<Status>("idle");
  const [errorMsg, setErrorMsg]     = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Paramètres manquants
  if (!chatId || !wholesalerId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f13] px-6">
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-white font-bold text-lg">Lien invalide</h1>
          <p className="text-white/50 text-sm">
            Ce lien est incomplet. Retourne sur le bot Telegram et clique à nouveau sur "Ajouter un produit".
          </p>
        </div>
      </div>
    );
  }

  const handleImage = (file: File) => {
    setImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const parsedPrice = parseFloat(price.replace(/[^0-9.]/g, ""));
    const parsedStock = parseInt(stock.replace(/[^0-9]/g, ""), 10);

    if (!name.trim()) { setErrorMsg("Le nom du produit est requis."); return; }
    if (isNaN(parsedPrice) || parsedPrice <= 0) { setErrorMsg("Prix invalide (ex : 5000)."); return; }
    if (isNaN(parsedStock) || parsedStock < 0)  { setErrorMsg("Stock invalide (ex : 10)."); return; }

    setStatus("loading");

    try {
      const fd = new FormData();
      fd.append("chatId",       chatId);
      fd.append("wholesalerId", wholesalerId);
      fd.append("name",         name.trim());
      fd.append("base_price",   String(parsedPrice));
      fd.append("stock",        String(parsedStock));
      if (description.trim()) fd.append("description", description.trim());
      if (image) fd.append("image", image);

      const res = await fetch(`${SUPABASE_URL}/functions/v1/add-product-web`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: fd,
      });

      const json = await res.json();
      if (json.success) {
        setStatus("success");
      } else {
        setErrorMsg(json.error || "Erreur inconnue.");
        setStatus("error");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Erreur réseau. Réessaie.");
      setStatus("error");
    }
  };

  // ── Écran succès ────────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f13] px-6">
        <div className="text-center space-y-5 max-w-xs">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-white font-bold text-xl">Produit ajouté !</h1>
            <p className="text-white/60 text-sm leading-relaxed">
              Ton produit <span className="text-white font-semibold">"{name}"</span> est maintenant visible dans ton catalogue.
            </p>
            <p className="text-white/40 text-xs">Une confirmation t'a été envoyée sur Telegram.</p>
          </div>
          <div className="pt-2 space-y-3">
            <button
              onClick={() => { setStatus("idle"); setName(""); setPrice(""); setStock(""); setDescription(""); setImage(null); setPreview(null); }}
              className="w-full h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white font-semibold text-sm"
            >
              ➕ Ajouter un autre produit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Formulaire ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f0f13] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0f0f13]/95 backdrop-blur border-b border-white/5 px-4 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
          <Package className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="font-bold text-base leading-tight">Ajouter un produit</h1>
          <p className="text-white/40 text-xs">Livrauto — Catalogue Grossiste</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-6 space-y-5 max-w-lg mx-auto pb-10">

        {/* Nom */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-white/80">
            Nom du produit <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex : Sac à main cuir marron"
            className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            required
          />
        </div>

        {/* Prix */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-white/80">
            Prix de base (FCFA) <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              inputMode="numeric"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="Ex : 5000"
              min="1"
              className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 pr-16 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              required
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 text-sm font-medium">FCFA</span>
          </div>
        </div>

        {/* Stock */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-white/80">
            Quantité en stock <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={stock}
            onChange={e => setStock(e.target.value)}
            placeholder="Ex : 20"
            min="0"
            className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            required
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-white/80">
            Description <span className="text-white/30 font-normal">(optionnel)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Décris ton produit en quelques mots…"
            rows={3}
            className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none"
          />
        </div>

        {/* Photo */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-white/80">
            Photo du produit <span className="text-white/30 font-normal">(optionnel)</span>
          </label>

          {preview ? (
            <div className="relative rounded-2xl overflow-hidden border border-white/10">
              <img src={preview} alt="Aperçu" className="w-full h-48 object-cover" />
              <button
                type="button"
                onClick={() => { setImage(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 backdrop-blur flex items-center justify-center hover:bg-black/80 transition"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full h-32 rounded-2xl border-2 border-dashed border-white/10 hover:border-indigo-500/50 bg-white/3 hover:bg-indigo-500/5 flex flex-col items-center justify-center gap-2 transition-all group"
            >
              <Upload className="w-6 h-6 text-white/30 group-hover:text-indigo-400 transition" />
              <span className="text-white/40 text-sm group-hover:text-indigo-400 transition">Cliquer pour choisir une image</span>
              <span className="text-white/20 text-xs">JPG, PNG, WEBP · max 5 Mo</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImage(f); }}
          />
        </div>

        {/* Erreur */}
        {(status === "error" || errorMsg) && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{errorMsg}</p>
          </div>
        )}

        {/* Bouton submit */}
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold text-white text-base shadow-lg shadow-indigo-600/25"
        >
          {status === "loading" ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Ajout en cours…
            </span>
          ) : (
            "✅ Ajouter le produit"
          )}
        </button>

        <p className="text-center text-white/20 text-xs pb-2">
          Une confirmation sera envoyée sur ton Telegram dès l'ajout.
        </p>
      </form>
    </div>
  );
}
