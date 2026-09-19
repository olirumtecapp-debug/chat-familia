import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImageForAvatar, DEFAULT_AVATAR, EMOJI_AVATAR_PRESETS } from "@/lib/emojiAvatars";
import { trpc } from "@/lib/trpc";
import { Camera, Image as ImageIcon, Loader2, Trash2, Upload, UserCog } from "lucide-react";
import React, { useRef, useState } from "react";
import { toast } from "sonner";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    name: string | null;
    email: string | null;
    statusMessage: string | null;
    avatarUrl: string | null;
  };
}

export function ProfileModal({ isOpen, onClose, currentUser }: ProfileModalProps) {
  const [name, setName] = useState(currentUser.name || "");
  const [statusMessage, setStatusMessage] = useState(currentUser.statusMessage || "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || DEFAULT_AVATAR);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const updateMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      utils.conversations.list.invalidate();
      utils.users.list.invalidate();
      toast.success("Perfil atualizado com sucesso!");
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao salvar perfil");
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      const compressedDataUrl = await compressImageForAvatar(file, 240);
      setAvatarUrl(compressedDataUrl);
      toast.success("Foto selecionada com sucesso! Clique em 'Salvar Alterações'.");
    } catch (err: any) {
      toast.error(err.message || "Não foi possível carregar esta imagem.");
    } finally {
      setIsProcessingImage(false);
      // Limpa input para permitir selecionar o mesmo arquivo novamente se necessário
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const isCustomPhoto = avatarUrl && !EMOJI_AVATAR_PRESETS.some((p) => p.url === avatarUrl);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("O nome não pode ficar vazio.");
      return;
    }

    updateMutation.mutate({
      name: name.trim(),
      statusMessage: statusMessage.trim(),
      avatarUrl,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px] max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-2xl shadow-xl">
        <DialogHeader className="text-left pb-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <UserCog className="w-5 h-5 text-emerald-600" />
            <span>Editar Meu Perfil</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Altere sua foto, nome ou frase de recado para a família.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Avatar com upload de foto real */}
          <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            {/* Input oculto para carregar imagem do computador */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-emerald-500 shadow-md ring-offset-2 bg-white dark:bg-slate-800">
                <img
                  src={avatarUrl}
                  alt="Foto do Perfil"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Botão de sobreposição na foto */}
              <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-semibold">
                <Camera className="w-5 h-5 mb-0.5" />
                <span>Trocar</span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="absolute bottom-0 right-0 p-1.5 bg-emerald-600 text-white rounded-full shadow-md hover:bg-emerald-700 transition-colors border-2 border-white dark:border-slate-900"
                title="Escolher foto do computador"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Ações da Foto */}
            <div className="flex items-center gap-2 mt-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingImage}
                className="h-8 text-xs font-semibold rounded-xl border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950 flex items-center gap-1.5 cursor-pointer"
              >
                {isProcessingImage ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>Escolher Foto do Computador</span>
              </Button>

              {isCustomPhoto && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAvatarUrl(DEFAULT_AVATAR)}
                  className="h-8 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-xl flex items-center gap-1 cursor-pointer"
                  title="Remover foto e voltar ao emoji"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover</span>
                </Button>
              )}
            </div>

            {isCustomPhoto ? (
              <span className="text-[11px] font-medium text-emerald-600 mt-1 flex items-center gap-1">
                <ImageIcon className="w-3 h-3" /> Foto Real Ativa
              </span>
            ) : (
              <span className="text-[11px] font-medium text-slate-500 mt-1">
                {EMOJI_AVATAR_PRESETS.find((p) => p.url === avatarUrl)?.label || "Emoji Selecionado"}
              </span>
            )}
          </div>

          {/* Opção rápida de trocar para um dos 6 emojis da família */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Ou selecione um Emoji da Família:
            </Label>
            <div className="flex items-center justify-between gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {EMOJI_AVATAR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setAvatarUrl(p.url)}
                  title={p.label}
                  className={`w-9 h-9 rounded-full transition-all flex items-center justify-center cursor-pointer ${
                    avatarUrl === p.url
                      ? "ring-3 ring-emerald-600 scale-105 shadow-sm z-10"
                      : "opacity-75 hover:opacity-100 hover:scale-105"
                  }`}
                >
                  <img src={p.url} alt={p.label} className="w-full h-full rounded-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Nome */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nome / Como te chamam na família
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Pai, Vovô, Pedro..."
              className="h-9.5 rounded-xl text-sm"
              required
            />
          </div>

          {/* Recado */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Recado / Frase de Status
            </Label>
            <Input
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              placeholder="Ex: No mercado / Disponível"
              className="h-9.5 rounded-xl text-sm"
            />
          </div>

          {/* Salvar */}
          <div className="pt-2">
            <Button
              type="submit"
              disabled={updateMutation.isPending || isProcessingImage}
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-md cursor-pointer"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>Salvando...</span>
                </>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
