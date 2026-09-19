import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Loader2, UserCog } from "lucide-react";
import { useState } from "react";
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

const AVATAR_PRESETS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
];

export function ProfileModal({ isOpen, onClose, currentUser }: ProfileModalProps) {
  const [name, setName] = useState(currentUser.name || "");
  const [statusMessage, setStatusMessage] = useState(currentUser.statusMessage || "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || AVATAR_PRESETS[0]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      name: name.trim(),
      statusMessage: statusMessage.trim(),
      avatarUrl,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px] p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <UserCog className="w-5 h-5 text-emerald-600" />
            Meu Perfil Familiar
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Atualize seu nome ou frase de status para que a família identifique você facilmente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="flex justify-center mb-1">
            <img
              src={avatarUrl}
              alt="Avatar Atual"
              className="w-20 h-20 rounded-full object-cover ring-4 ring-emerald-500 shadow-md"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Escolha uma nova foto</Label>
            <div className="flex items-center gap-2 justify-center py-1 overflow-x-auto">
              {AVATAR_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatarUrl(p)}
                  className={`w-9 h-9 rounded-full overflow-hidden transition-all ${
                    avatarUrl === p ? "ring-2 ring-emerald-600 scale-110" : "opacity-60"
                  }`}
                >
                  <img src={p} alt="Preset" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Nome / Como te chamam</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Pai, Vovô, Pedro..."
              className="h-10 rounded-xl"
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Status / Recado</Label>
            <Input
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              placeholder="Ex: No mercado / Disponível"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold"
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
