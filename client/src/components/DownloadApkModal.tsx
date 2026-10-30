import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ShieldCheck, Zap, Globe, Smartphone, CheckCircle2, ArrowRight } from "lucide-react";

interface DownloadApkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DownloadApkModal({ open, onOpenChange }: DownloadApkModalProps) {
  const apkDownloadUrl = "/ChatForAll.apk";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6 bg-[var(--surface,#ffffff)] dark:bg-slate-900 text-[var(--ink,#0f172a)] dark:text-slate-100 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader className="text-center sm:text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg shadow-emerald-500/20 mb-3 border border-slate-200 dark:border-slate-700 p-2 bg-gradient-to-tr from-slate-900 to-slate-800">
            <img src="/icon-192.png" alt="ChatForAll Logo" className="w-full h-full object-contain" onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }} />
          </div>
          <DialogTitle className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            ChatForAll para Android (APK)
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Instale o aplicativo nativo oficial no seu celular para receber chamadas e mensagens em tempo real com máxima velocidade.
          </DialogDescription>
        </DialogHeader>

        {/* Recursos Principais */}
        <div className="grid grid-cols-2 gap-2.5 my-3 text-xs">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 font-bold text-[#0080EA] dark:text-[#38BDF8]">
              <ShieldCheck className="w-4 h-4" /> 100% Privado
            </div>
            <span className="text-slate-500 dark:text-slate-400">Sem expor número de telefone pessoal para ninguém.</span>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 font-bold text-sky-600 dark:text-sky-400">
              <Zap className="w-4 h-4" /> Super Rápido
            </div>
            <span className="text-slate-500 dark:text-slate-400">Mensagens, fotos HD e chamadas de vídeo nítidas.</span>
          </div>
        </div>

        {/* Botão Principal de Download */}
        <div className="space-y-2 mt-1">
          <a
            href={apkDownloadUrl}
            download="ChatForAll.apk"
            className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl bg-[#0080EA] hover:bg-[#0060B8] active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-emerald-600/25 transition-all text-center"
          >
            <Download className="w-5 h-5" />
            Baixar APK Oficial Grátis (Android)
          </a>

          <div className="flex items-center justify-between px-2 pt-1 text-[11px] text-slate-400">
            <span>Versão 1.0.0 Oficial</span>
            <span className="flex items-center gap-1 text-[#0080EA] dark:text-[#38BDF8] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Verificado e Seguro
            </span>
          </div>
        </div>

        {/* Opção para continuar na Web */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            Prefere não instalar agora?
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="font-semibold text-[#0080EA] hover:text-[#0060B8] dark:text-[#38BDF8] underline cursor-pointer"
            >
              Continuar usando pelo Navegador Web
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
