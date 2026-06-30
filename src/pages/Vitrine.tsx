import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ShoppingCart, MessageCircle, Send, X, ChevronDown,
  ChevronUp, Package, AlertCircle, CheckCircle, Store,
  Loader2, ShoppingBag,
} from "lucide-react";

const SB_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const call = (fn: string, params?: Record<string, string>) => {
  const u = new URL(`${SB_URL}/functions/v1/${fn}`);
  if (params) Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return fetch(u.toString(), {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
  }).then(r => r.json());
};

const post = (fn: string, body: unknown) =>
  fetch(`${SB_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(r => r.json());

type Product = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  retail_price: number;
  stock: number;
  reseller_name: string;
  comment_count: number;
  created_at: string;
};

type Comment = {
  id: string;
  buyer_name: string;
  content: string;
  created_at: string;
};

type Toast = { id: number; msg: string; ok: boolean };

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return "À l'instant";
  if (s < 3600)  return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} j`;
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const colors = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444"];
  const color  = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
      style={{ background: color }}>
      {initials || <Store size={16} />}
    </div>
  );
}

// ── Carte produit style "publication Facebook" ────────────────────────────────
function ProductCard({
  product, chatId, onCartChange, focusRef,
}: {
  product: Product;
  chatId: string | null;
  onCartChange: (delta: number, newCount: number) => void;
  focusRef?: (el: HTMLDivElement | null) => void;
}) {
  const [inCart,    setInCart]    = useState(false);
  const [cartBusy,  setCartBusy]  = useState(false);
  const [comments,  setComments]  = useState<Comment[]>([]);
  const [commCount, setCommCount] = useState(product.comment_count);
  const [showComm,  setShowComm]  = useState(false);
  const [commLoading, setCommLoading] = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newText,   setNewText]   = useState("");
  const [sending,   setSending]   = useState(false);

  const loadComments = async () => {
    if (commLoading || comments.length > 0) { setShowComm(s => !s); return; }
    setShowComm(true);
    setCommLoading(true);
    const res = await call("vitrine-data", { product_id: product.id });
    setComments(res.comments ?? []);
    setCommLoading(false);
  };

  const toggleCart = async () => {
    if (!chatId) return;
    setCartBusy(true);
    const action = inCart ? "remove_cart" : "add_cart";
    const res = await post("vitrine-action", { action, chatId: Number(chatId), product_id: product.id });
    if (res.success) {
      const was = inCart;
      setInCart(!was);
      onCartChange(was ? -1 : 1, res.cart_count);
    }
    setCartBusy(false);
  };

  const sendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || sending) return;
    setSending(true);
    const res = await post("vitrine-action", {
      action: "comment",
      chatId: chatId ? Number(chatId) : null,
      product_id: product.id,
      buyer_name: newName.trim() || "Anonyme",
      content: newText.trim(),
    });
    if (res.success && res.comment) {
      setComments(c => [...c, res.comment]);
      setCommCount(n => n + 1);
      setNewText("");
    }
    setSending(false);
  };

  const outOfStock = product.stock <= 0;

  return (
    <div ref={focusRef}
      className="bg-[#1a1a24] rounded-3xl overflow-hidden border border-white/5 shadow-lg">

      {/* ── Header boutique ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar name={product.reseller_name} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm truncate">{product.reseller_name}</p>
          <p className="text-white/40 text-xs">{timeAgo(product.created_at)}</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
          outOfStock ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
        }`}>
          {outOfStock ? "Rupture" : `${product.stock} dispo`}
        </span>
      </div>

      {/* ── Photo produit ── */}
      {product.image_url ? (
        <div className="w-full aspect-[4/3] bg-black">
          <img src={product.image_url} alt={product.name}
            className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-full aspect-[4/3] bg-white/3 flex items-center justify-center">
          <Package className="w-16 h-16 text-white/10" />
        </div>
      )}

      {/* ── Prix ── */}
      <div className="px-4 pt-4 pb-1 flex items-start justify-between gap-3">
        <h2 className="text-white font-bold text-lg leading-snug">{product.name}</h2>
        <span className="flex-shrink-0 text-lg font-black text-indigo-400">
          {Number(product.retail_price).toLocaleString("fr-FR")} <span className="text-sm font-semibold text-indigo-400/70">F</span>
        </span>
      </div>

      {/* ── Description ── */}
      {product.description && (
        <p className="px-4 pb-3 text-white/60 text-sm leading-relaxed">{product.description}</p>
      )}

      {/* ── Barre d'actions ── */}
      <div className="px-4 pb-3 flex items-center gap-2 border-t border-white/5 pt-3">
        <button
          onClick={toggleCart}
          disabled={cartBusy || outOfStock || !chatId}
          className={`flex-1 h-11 rounded-2xl flex items-center justify-center gap-2 font-semibold text-sm transition-all active:scale-95 ${
            inCart
              ? "bg-emerald-600/20 border border-emerald-500/40 text-emerald-400"
              : outOfStock || !chatId
              ? "bg-white/5 text-white/20 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/25"
          }`}
        >
          {cartBusy
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : inCart
            ? <><CheckCircle className="w-4 h-4" /> Dans le panier</>
            : <><ShoppingCart className="w-4 h-4" /> Ajouter au panier</>
          }
        </button>

        <button
          onClick={loadComments}
          className="h-11 px-4 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center gap-1.5 text-white/60 text-sm font-medium transition-all active:scale-95"
        >
          <MessageCircle className="w-4 h-4" />
          {commCount > 0 && <span className="text-white/80 font-semibold">{commCount}</span>}
          {showComm ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ── Section commentaires ── */}
      {showComm && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-3">
          {commLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-white/30 text-sm py-3">Sois le premier à commenter 💬</p>
          ) : (
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {comments.map(c => (
                <div key={c.id} className="flex gap-2.5">
                  <Avatar name={c.buyer_name} />
                  <div className="flex-1 bg-white/5 rounded-2xl px-3 py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-white text-xs font-semibold">{c.buyer_name}</span>
                      <span className="text-white/30 text-[10px]">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="text-white/70 text-sm mt-0.5 leading-relaxed">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Formulaire commentaire */}
          <form onSubmit={sendComment} className="space-y-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Votre prénom (optionnel)"
              maxLength={50}
              className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newText}
                onChange={e => setNewText(e.target.value)}
                placeholder="Écrire un commentaire…"
                maxLength={500}
                required
                className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition"
              />
              <button
                type="submit"
                disabled={sending || !newText.trim()}
                className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white" />}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Vitrine() {
  const [params]   = useSearchParams();
  const chatId     = params.get("chatId");
  const focusProd  = params.get("id");

  const [products,  setProducts]  = useState<Product[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [toasts,    setToasts]    = useState<Toast[]>([]);
  const [showCart,  setShowCart]  = useState(false);
  const focusRef   = useRef<HTMLDivElement | null>(null);

  // Charger les produits
  useEffect(() => {
    const load = async () => {
      try {
        const res = await call("vitrine-data", chatId ? { chatId } : {});
        if (res.error) { setError(res.error); return; }
        setProducts(res.products ?? []);
        setCartCount(res.cart_count ?? 0);
      } catch (e: any) {
        setError(e.message ?? "Erreur réseau");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [chatId]);

  // Scroll vers le produit mis en avant
  useEffect(() => {
    if (focusProd && focusRef.current) {
      setTimeout(() => focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 600);
    }
  }, [focusProd, products.length]);

  const addToast = (msg: string, ok: boolean) => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  };

  const handleCartChange = (delta: number, newCount: number) => {
    setCartCount(newCount);
    addToast(delta > 0 ? "✅ Ajouté au panier !" : "🗑️ Retiré du panier", delta > 0);
  };

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0f0f13] text-white">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0f0f13]/95 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <Store className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-white">Vitrine Livrauto</h1>
            <p className="text-white/40 text-xs">{products.length} publication{products.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Bouton panier */}
        {chatId && (
          <button
            onClick={() => setShowCart(s => !s)}
            className="relative h-10 px-4 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center gap-2 text-sm font-semibold hover:bg-indigo-600/30 transition active:scale-95"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Panier</span>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Bandeau "Finaliser" si panier */}
      {showCart && cartCount > 0 && (
        <div className="mx-4 mt-3 p-4 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-between gap-3">
          <div>
            <p className="text-indigo-300 font-semibold text-sm">{cartCount} article{cartCount > 1 ? "s" : ""} dans ton panier</p>
            <p className="text-white/40 text-xs mt-0.5">Retourne sur le bot Telegram pour finaliser ta commande 💬</p>
          </div>
          <button onClick={() => setShowCart(false)}>
            <X className="w-4 h-4 text-white/30" />
          </button>
        </div>
      )}

      {/* Pas de chatId */}
      {!chatId && (
        <div className="mx-4 mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-amber-300 text-xs">Ouvre ce lien depuis le bot Telegram pour activer le panier.</p>
        </div>
      )}

      {/* Feed */}
      <div className="px-4 py-4 space-y-5 max-w-lg mx-auto pb-10">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-[#1a1a24] rounded-3xl overflow-hidden border border-white/5 animate-pulse">
              <div className="flex items-center gap-3 p-4">
                <div className="w-10 h-10 rounded-full bg-white/10" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 w-32 rounded bg-white/10" />
                  <div className="h-2 w-20 rounded bg-white/5" />
                </div>
              </div>
              <div className="w-full aspect-[4/3] bg-white/5" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 rounded bg-white/10" />
                <div className="h-3 w-1/2 rounded bg-white/5" />
              </div>
            </div>
          ))
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <AlertCircle className="w-12 h-12 text-red-400/60" />
            <p className="text-white/40 text-sm">{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Package className="w-12 h-12 text-white/10" />
            <p className="text-white/40 text-sm">Aucun produit disponible pour le moment.</p>
          </div>
        ) : (
          products.map(p => (
            <ProductCard
              key={p.id}
              product={p}
              chatId={chatId}
              onCartChange={handleCartChange}
              focusRef={p.id === focusProd ? (el) => { focusRef.current = el; } : undefined}
            />
          ))
        )}
      </div>

      {/* Toasts */}
      <div className="fixed bottom-6 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none z-50">
        {toasts.map(t => (
          <div key={t.id}
            className={`px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-300 ${
              t.ok ? "bg-emerald-600/90 text-white" : "bg-slate-700/90 text-white"
            }`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
