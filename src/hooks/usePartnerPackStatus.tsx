import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * État du parcours Pack Officiel pour l'utilisateur courant.
 *
 * Source de vérité : table `partner_packs` (et NON le simple flag `is_partner`,
 * qui est mis à true dès le paiement validé mais ne dit rien de l'avancement
 * réel dans le tunnel — 2FA, 1win, déblocage logiciel).
 */
export interface PartnerPackStatus {
  hasPack: boolean;            // un pack existe (au moins payé)
  pack: any | null;            // ligne brute partner_packs
  isDelivered: boolean;        // numéro Telegram livré
  did2fa: boolean;             // 2FA confirmée dans le bot
  didPartner: boolean;         // inscription 1win confirmée
  isComplete: boolean;         // tunnel 100% terminé (logiciel débloqué)
  needsToContinue: boolean;    // a un pack mais tunnel non terminé
}

export function usePartnerPackStatus() {
  const { user } = useAuth();

  return useQuery<PartnerPackStatus>({
    queryKey: ["partner-pack-status", user?.id],
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("partner_packs")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const pack = rows?.[0] ?? null;
      if (!pack) {
        return {
          hasPack: false, pack: null,
          isDelivered: false, did2fa: false, didPartner: false,
          isComplete: false, needsToContinue: false,
        };
      }

      const isDelivered = pack.status === "delivered";
      const did2fa      = !!pack.secured_2fa_at;
      const didPartner  = !!pack.partner_clicked_at;
      const isComplete  = !!pack.software_unlocked_at;
      return {
        hasPack: true,
        pack,
        isDelivered,
        did2fa,
        didPartner,
        isComplete,
        needsToContinue: !isComplete,
      };
    },
  });
}
