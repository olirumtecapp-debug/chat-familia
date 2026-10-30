import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Share2, Copy, Check, UserPlus, Sparkles, MessageCircle } from "lucide-react";
import { toast } from "sonner";

interface InviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserName?: string | null;
  currentUserEmail?: string | null;
}

export function InviteModal({ open, onOpenChange, currentUserName, currentUserEmail }: InviteModalProps) {
  const [copied, setCopied] = useState(false);

  // Gera o identificador limpo ou apelido amigável
  const username = (currentUserName || currentUserEmail?.split("@")[0] || "amigo")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]/g, "");

  // Link mágico amigável
  const origin = typeof window !== "undefined" ? window.location.origin : "https://chat.creativeam.com.br";
  const inviteLink = `${origin}/?u=${encodeURIComponent(username)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success("Link de convite copiado!");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    const text = `Oi! Estou usando o ChatForAll para conversar com privacidade e sem anúncios. Toque no link para falar comigo diretamente pelo navegador ou instalar o aplicativo: ${inviteLink}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Conversar no ChatForAll",
          text: text,
          url: inviteLink,
        });
      } catch (err) {
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 bg-[var(--surface,#ffffff)] dark:bg-slate-900 text-[var(--ink,#0f172a)] dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader className="text-center sm:text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-3">
            <UserPlus className="w-7 h-7" />
          </div>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            Convidar Amigo ou Família <Sparkles className="w-4 h-4 text-amber-500" />
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Envie seu link pessoal. A pessoa pode abrir direto na internet ou instalar o aplicativo para conversar com você!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Seu Link Mágico de Convite:
            </label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={inviteLink}
                className="bg-slate-50 dark:bg-slate-950 font-mono text-xs border-slate-200 dark:border-slate-800 select-all"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Copiar link"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
            <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong>Funciona sem instalar e com APK:</strong> Quem abrir esse link pode bater papo com você na mesma hora pelo navegador web ou optar por baixar o APK oficial.
            </div>
          </div>
        </div>

        <div className="flex gap-2.5 mt-2">
          <Button
            variant="outline"
            onClick={handleCopy}
            className="flex-1 rounded-xl border-slate-200 dark:border-slate-800"
          >
            {copied ? <Check className="w-4 h-4 mr-2 text-emerald-600" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copiado!" : "Copiar Link"}
          </Button>
          <Button
            onClick={handleShare}
            className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Compartilhar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
