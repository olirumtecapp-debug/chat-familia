import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Share, PlusSquare, MoreVertical, Smartphone, Check } from "lucide-react";

interface InstallAppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isIOS: boolean;
}

export function InstallAppModal({ open, onOpenChange, isIOS }: InstallAppModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 bg-[var(--surface)] text-[var(--ink)] border-[var(--line)]">
        <DialogHeader className="text-center sm:text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-md mb-3 border border-[var(--line)]">
            <img src="/icon-192.png" alt="ChatForAll Logo" className="w-full h-full object-cover" />
          </div>
          <DialogTitle className="text-xl font-bold">Instalar o ChatForAll</DialogTitle>
          <DialogDescription className="text-sm text-[var(--muted)] mt-1">
            Instale o atalho com o ícone oficial na tela inicial do seu celular ou computador para abrir direto como aplicativo!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {isIOS ? (
            <div className="space-y-3 bg-[var(--surface-soft)] p-4 rounded-xl text-sm border border-[var(--line)]">
              <div className="font-semibold text-[var(--accent)] flex items-center gap-2">
                <Smartphone className="w-4 h-4" /> Passo a passo no iPhone / iPad (Safari):
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center shrink-0 font-bold">
                  1
                </div>
                <div className="leading-relaxed">
                  Toque no botão de <strong>Compartilhar</strong> <Share className="inline w-4 h-4 text-[var(--accent)] mx-1" /> na barra inferior do Safari.
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center shrink-0 font-bold">
                  2
                </div>
                <div className="leading-relaxed">
                  Role a lista e selecione <strong>"Adicionar à Tela de Início"</strong> <PlusSquare className="inline w-4 h-4 text-[var(--accent)] mx-1" />.
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center shrink-0 font-bold">
                  3
                </div>
                <div className="leading-relaxed">
                  Toque em <strong>"Adicionar"</strong> no canto superior direito. Pronto!
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 bg-[var(--surface-soft)] p-4 rounded-xl text-sm border border-[var(--line)]">
              <div className="font-semibold text-[var(--accent)] flex items-center gap-2">
                <Smartphone className="w-4 h-4" /> Passo a passo no Android / Chrome / PC:
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center shrink-0 font-bold">
                  1
                </div>
                <div className="leading-relaxed">
                  Toque no menu do navegador (<strong>três pontinhos</strong> <MoreVertical className="inline w-4 h-4 text-[var(--accent)] mx-0.5" /> no canto superior ou inferior).
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center shrink-0 font-bold">
                  2
                </div>
                <div className="leading-relaxed">
                  Selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center shrink-0 font-bold">
                  3
                </div>
                <div className="leading-relaxed">
                  Confirme a instalação. O ícone oficial do ChatForAll aparecerá junto aos seus outros aplicativos!
                </div>
              </div>
            </div>
          )}
        </div>

        <Button onClick={() => onOpenChange(false)} className="w-full mt-2">
          <Check className="w-4 h-4 mr-2" /> Entendi
        </Button>
      </DialogContent>
    </Dialog>
  );
}
