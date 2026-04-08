import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TermsOfUseProps {
  accepted: boolean;
  onAcceptChange: (accepted: boolean) => void;
}

const TermsOfUse = ({ accepted, onAcceptChange }: TermsOfUseProps) => (
  <div className="space-y-3">
    <p className="text-sm font-semibold text-foreground">Conditions d'utilisation</p>
    <ScrollArea className="h-48 rounded-xl border border-border bg-muted/30 p-4">
      <div className="space-y-3 text-xs text-muted-foreground leading-relaxed pr-3">
        <p className="font-semibold text-foreground">📋 Conditions Générales d'Utilisation — Machine de Minage</p>

        <p>
          En activant une machine de minage sur notre plateforme, vous acceptez les conditions suivantes :
        </p>

        <p className="font-semibold text-foreground">1. Paiement unique</p>
        <p>
          L'activation d'une machine nécessite un paiement unique et non remboursable de <strong className="text-foreground">2 500 FCFA</strong>.
          Ce paiement vous donne accès à une machine de minage permanente. Aucun autre paiement ne sera exigé.
        </p>

        <p className="font-semibold text-foreground">2. Vitesse de minage initiale</p>
        <p>
          À l'activation, votre machine démarre avec une vitesse de minage initiale calculée automatiquement.
          Cette vitesse détermine le nombre de π que vous gagnez par heure. Plus votre vitesse est élevée, plus vous accumulez de π rapidement.
        </p>

        <p className="font-semibold text-foreground">3. Diminution progressive de la vitesse</p>
        <p>
          Votre vitesse de minage diminue progressivement au fil du temps à mesure que des π sont crédités sur votre compte.
          Lorsque la vitesse atteint <strong className="text-foreground">0 π/h</strong>, votre machine continue de tourner mais ne génère plus de gains.
        </p>

        <p className="font-semibold text-foreground">4. Augmentation de la vitesse par parrainage</p>
        <p>
          Le <strong className="text-foreground">seul moyen</strong> d'augmenter votre vitesse de minage est le parrainage.
          Lorsqu'un de vos filleuls active sa propre machine, votre vitesse de minage est automatiquement boostée.
          Il n'existe aucun autre moyen de recharger ou d'augmenter votre vitesse.
        </p>

        <p className="font-semibold text-foreground">5. Machine permanente</p>
        <p>
          Une fois activée, votre machine tourne en permanence. Le disque ne s'arrête jamais.
          Cependant, les gains ne sont générés que lorsque votre vitesse est supérieure à 0 π/h.
        </p>

        <p className="font-semibold text-foreground">6. Conversion et retrait</p>
        <p>
          Les π accumulés peuvent être convertis en FCFA selon le taux de conversion en vigueur.
          Les retraits sont effectués via Mobile Money (MTN, Moov, Orange) et sont soumis à un délai de traitement.
        </p>

        <p className="font-semibold text-foreground">7. Limitation de responsabilité</p>
        <p>
          La plateforme ne garantit aucun revenu fixe. Les gains dépendent de votre vitesse de minage et de votre activité de parrainage.
          Les taux de conversion π/FCFA peuvent varier.
        </p>

        <p className="font-semibold text-foreground">8. Interdictions</p>
        <p>
          Toute tentative de fraude, de création de comptes multiples ou de manipulation du système de parrainage entraînera la suspension définitive du compte sans remboursement.
        </p>

        <p className="mt-2 text-foreground font-medium">
          En cochant la case ci-dessous, vous confirmez avoir lu et accepté l'intégralité de ces conditions.
        </p>
      </div>
    </ScrollArea>

    <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/50">
      <Checkbox
        checked={accepted}
        onCheckedChange={(checked) => onAcceptChange(checked === true)}
        className="mt-0.5"
      />
      <span className="text-sm text-foreground leading-snug">
        J'ai lu et j'accepte les <strong>conditions d'utilisation</strong> de la machine de minage
      </span>
    </label>
  </div>
);

export default TermsOfUse;
