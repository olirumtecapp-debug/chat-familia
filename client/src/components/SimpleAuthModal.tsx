import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_AVATAR, EMOJI_AVATAR_PRESETS } from "@/lib/emojiAvatars";
import { trpc } from "@/lib/trpc";
import { Heart, Loader2, Sparkles } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

interface SimpleAuthModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export function SimpleAuthModal({ isOpen, onSuccess }: SimpleAuthModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState("Oi família, estou online!");
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR);

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.loginSimple.useMutation({
    onSuccess: (data) => {
      toast.success(`Bem-vindo(a), ${data.user.name}!`);
      if (data.token) {
        try {
          sessionStorage.setItem("manus-cookie", `app_session_id=${data.token}`);
        } catch {}
      }
      utils.auth.me.setData(undefined, data.user);
      utils.conversations.list.invalidate();
      utils.users.list.invalidate();
      onSuccess();
    },
    onError: (err) => {
      toast.error(err.message || "Não foi possível entrar");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Por favor, preencha seu nome e email.");
      return;
    }

    loginMutation.mutate({
      name: name.trim(),
      email: email.trim(),
      statusMessage: statusMessage.trim(),
      avatarUrl,
    });
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-[420px] max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-2xl shadow-xl">
        <DialogHeader className="text-left pb-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 shadow-xs">
              <Heart className="w-4 h-4 fill-emerald-600" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">
              CasaChat da Família
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
            Digite seu nome e email para entrar na sala da família.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          {/* Nome */}
          <div className="space-y-1">
            <Label htmlFor="name" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Seu Nome ou Apelido Familiar
            </Label>
            <Input
              id="name"
              placeholder="Ex: Pai, Mãe, Beto, Luiza..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9.5 rounded-xl text-sm"
              required
              autoFocus
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Seu Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="seuemail@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9.5 rounded-xl text-sm"
              required
            />
          </div>

          {/* Recado / Status */}
          <div className="space-y-1">
            <Label htmlFor="status" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Recado / Frase de Status
            </Label>
            <Input
              id="status"
              placeholder="Ex: No trabalho / Pronta pro almoço"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              className="h-9.5 rounded-xl text-sm"
            />
          </div>

          {/* Escolha rápida de Emoji inicial (6 opções essenciais) */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Avatar Inicial
              </Label>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {EMOJI_AVATAR_PRESETS.find((p) => p.url === avatarUrl)?.label || "Selecionado"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {EMOJI_AVATAR_PRESETS.map((preset) => {
                const isSelected = avatarUrl === preset.url;
                return (
                  <button
                    type="button"
                    key={preset.id}
                    onClick={() => setAvatarUrl(preset.url)}
                    title={preset.label}
                    className={`relative w-10 h-10 rounded-full transition-all flex items-center justify-center cursor-pointer ${
                      isSelected
                        ? "ring-3 ring-emerald-500 scale-105 shadow-md z-10"
                        : "opacity-75 hover:opacity-100 hover:scale-105"
                    }`}
                  >
                    <img
                      src={preset.url}
                      alt={preset.label}
                      className="w-full h-full rounded-full object-cover"
                    />
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center pt-0.5">
              💡 <em>Após entrar, você poderá carregar uma <strong>foto real do seu computador</strong> no perfil!</em>
            </p>
          </div>

          {/* Botão de Entrar sempre visível */}
          <div className="pt-2">
            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Entrando na sala...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Entrar no Chat da Família</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
