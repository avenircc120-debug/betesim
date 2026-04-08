import { HelpCircle, MessageCircle, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import BottomNav from "@/components/BottomNav";

const faqItems = [
  {
    q: "Comment fonctionne le minage sur PI REAL ?",
    a: "Choisissez une machine, payez 2 500 FCFA via Mobile Money, et recevez des π progressivement dans votre portefeuille. Les gains s'ajoutent automatiquement chaque heure.",
  },
  {
    q: "Comment parrainer un ami ?",
    a: "Allez dans votre profil (Compte), copiez votre lien de parrainage et partagez-le. Parrainez et augmentez la vitesse de votre minage !",
  },
  {
    q: "Comment convertir mes π en FCFA ?",
    a: "Allez dans l'onglet Wallet, saisissez le montant de π à convertir et confirmez. Le taux de conversion est mis à jour régulièrement.",
  },
  {
    q: "Comment retirer mes FCFA ?",
    a: "Dans le Wallet, cliquez sur Retirer, entrez votre numéro Mobile Money et le montant. Le retrait est traité sous 24-48h.",
  },
  {
    q: "Combien de machines puis-je activer ?",
    a: "Vous pouvez activer une seule machine à la fois. Une fois terminée, vous pouvez en activer une nouvelle.",
  },
  {
    q: "Les bonus de parrainage sont-ils cumulables ?",
    a: "Oui ! Chaque nouveau filleul augmente la vitesse de votre minage. Plus vous parrainez, plus vous minez vite.",
  },
  {
    q: "Comment contacter le support ?",
    a: "Envoyez-nous un message via WhatsApp au numéro indiqué en bas de cette page, ou écrivez à support@pireal.app.",
  },
];

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg px-4 pt-5 space-y-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Centre d'aide</h1>
          <p className="text-sm text-muted-foreground">Trouvez des réponses à vos questions</p>
        </motion.div>

        {/* FAQ items */}
        <div className="space-y-2.5">
          {faqItems.map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                className="w-full rounded-2xl bg-card p-4 shadow-card text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <HelpCircle className="h-5 w-5 text-primary" />
                  </div>
                  <p className="flex-1 font-semibold text-foreground text-sm">{item.q}</p>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${openIndex === idx ? "rotate-180" : ""}`} />
                </div>
                <AnimatePresence>
                  {openIndex === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <p className="mt-3 pl-[52px] text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </motion.div>
          ))}
        </div>

        {/* Contact */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-card p-5 shadow-card space-y-3"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-accent">
              <MessageCircle className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Besoin d'aide ?</h3>
              <p className="text-xs text-muted-foreground">Notre équipe est disponible 7j/7</p>
            </div>
          </div>
          <a
            href="https://wa.me/22900000000?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20sur%20PI%20REAL"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-accent-foreground font-semibold text-base"
          >
            <MessageCircle className="h-5 w-5" />
            Contacter via WhatsApp
          </a>
        </motion.div>
      </div>
      <BottomNav />
    </div>
  );
};

export default FAQ;
