import { motion } from "framer-motion";
import { MessageCircle, Send, Copy } from "lucide-react";
import { toast } from "sonner";

interface ShareButtonsProps {
  referralLink: string;
}

const ShareButtons = ({ referralLink }: ShareButtonsProps) => {
  const message = encodeURIComponent(
    `🔐 Rejoins betesim et obtiens des services winpack pour WhatsApp, TikTok, Instagram et plus !\n\nInscris-toi avec mon lien partenaire :\n${referralLink}`
  );

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Lien copié !");
  };

  return (
    <div className="flex items-center gap-2">
      <motion.a
        whileTap={{ scale: 0.9 }}
        href={`https://wa.me/?text=${message}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-accent-foreground font-semibold text-sm"
      >
        <MessageCircle className="h-4 w-4" />
        WhatsApp
      </motion.a>
      <motion.a
        whileTap={{ scale: 0.9 }}
        href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("🔐 Rejoins betesim — services winpack pour tous vos réseaux !")}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
      >
        <Send className="h-4 w-4" />
        Telegram
      </motion.a>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={copyLink}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
      >
        <Copy className="h-4 w-4" />
      </motion.button>
    </div>
  );
};

export default ShareButtons;
