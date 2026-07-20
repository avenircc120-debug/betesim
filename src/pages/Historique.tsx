import { useState } from "react";
    import { Search, Bell, Inbox, Menu, LogIn } from "lucide-react";
    import { useNavigate } from "react-router-dom";
    import { motion, AnimatePresence } from "framer-motion";
    import BottomNav from "@/components/BottomNav";
    import DrawerMenu from "@/components/DrawerMenu";
    import { useAuth } from "@/hooks/useAuth";
    import { useQuery } from "@tanstack/react-query";
    import { supabase } from "@/integrations/supabase/client";

    type FilterType = "Actifs" | "En attente" | "Expirés" | "Tous";
    const FILTERS: FilterType[] = ["Actifs", "En attente", "Expirés", "Tous"];
    const statusMap: Record<FilterType, string | null> = {
    "Actifs": "active", "En attente": "pending", "Expirés": "expired", "Tous": null,
    };

    const Historique = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [filter, setFilter] = useState<FilterType>("Tous");
    const [search, setSearch] = useState("");
    const [drawerOpen, setDrawerOpen] = useState(false);

    const { data: numbers = [], isLoading } = useQuery({
      queryKey: ["virtual_numbers", user?.id, filter],
      queryFn: async () => {
        if (!user) return [];
        let q = supabase
          .from("virtual_numbers")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        const st = statusMap[filter];
        if (st) q = q.eq("status", st);
        const { data } = await q;
        return data ?? [];
      },
      enabled: !!user,
    });

    const filtered = numbers.filter((n: any) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return n.service_name?.toLowerCase().includes(s) || n.country?.toLowerCase().includes(s) || n.number?.includes(s);
    });

    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        {/* Header */}
        <div className="bg-white px-4 pt-12 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setDrawerOpen(true)} className="text-gray-700">
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Mes</h1>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <button className="flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1.5">
                <span className="text-base">🪙</span>
                <span className="text-sm font-semibold text-orange-500">0</span>
              </button>
            ) : (
              <button
                onClick={() => navigate("/login", { state: { from: "/historique" } })}
                className="flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white"
              >
                <LogIn className="h-4 w-4" />
                Se connecter
              </button>
            )}
            <button className="text-gray-500">
              <Bell className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Si non connecté — écran de connexion */}
        {!user ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-5 pt-24 px-6 text-center"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-100">
              <Inbox className="h-10 w-10 text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Vos numéros vous attendent</h2>
              <p className="text-sm text-gray-500">Connectez-vous pour voir vos numéros virtuels achetés.</p>
            </div>
            <button
              onClick={() => navigate("/login", { state: { from: "/historique" } })}
              className="flex items-center gap-2 rounded-2xl bg-orange-500 px-8 py-3.5 text-sm font-bold text-white shadow-md active:scale-95 transition-transform"
            >
              <LogIn className="h-4 w-4" />
              Se connecter / S'inscrire
            </button>
          </motion.div>
        ) : (
          <div className="px-4 pt-4 space-y-3">
            {/* Filtres */}
            <div className="flex gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition-all ${
                    filter === f ? "bg-orange-500 text-white shadow-md" : "bg-white text-gray-500 border border-gray-200"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Recherche */}
            <div className="flex items-center gap-2 rounded-2xl bg-white border border-gray-200 px-4 py-3">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par service ou pays..."
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
              />
            </div>

            {/* Loader */}
            {isLoading && (
              <div className="space-y-3 pt-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />)}
              </div>
            )}

            {/* Liste vide */}
            {!isLoading && filtered.length === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 pt-20"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                  <Inbox className="h-10 w-10 text-gray-400" />
                </div>
                <p className="text-base font-medium text-gray-500">Aucun numéro trouvé</p>
                <button
                  onClick={() => navigate("/boutique")}
                  className="rounded-full bg-orange-500 px-8 py-3 text-sm font-bold text-white shadow-md active:scale-95 transition-transform"
                >
                  Obtenir un numéro
                </button>
              </motion.div>
            )}

            {/* Liste */}
            <AnimatePresence>
              {filtered.map((num: any, i: number) => (
                <motion.div
                  key={num.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100">
                    <span className="text-lg">📱</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{num.service_name ?? "Service"}</p>
                    <p className="text-xs font-mono text-orange-500">{num.number}</p>
                    <p className="text-xs text-gray-400">{num.country}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                    num.status === "active" ? "bg-green-100 text-green-600"
                    : num.status === "pending" ? "bg-yellow-100 text-yellow-600"
                    : "bg-gray-100 text-gray-500"
                  }`}>
                    {num.status === "active" ? "Actif" : num.status === "pending" ? "En attente" : "Expiré"}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <DrawerMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <BottomNav />
      </div>
    );
    };

    export default Historique;
    