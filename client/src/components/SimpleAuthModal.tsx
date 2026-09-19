import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Heart, Loader2, Sparkles, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface SimpleAuthModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

const AVATAR_PRESETS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80",
];

export function SimpleAuthModal({ isOpen, onSuccess }: SimpleAuthModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState("Oi família, estou online!");
  const [avatarUrl, setAvatarUrl] = useState(AVATAR_PRESETS[0]);

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.loginSimple.useMutation({
    onSuccess: (data) => {
      toast.success(`Bem-vindo(a), ${data.user.name}!`);
      utils.auth.me.invalidate();
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
      <DialogContent className="sm:max-w-[440px] p-6 rounded-2xl">
        <DialogHeader className="text-center sm:text-left">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-2 mx-auto sm:mx-0 shadow-sm">
            <Heart className="w-6 h-6 fill-emerald-600" />
          </div>
          <DialogTitle className="text-2xl font-bold tracking-tight text-slate-800 dark:text-white">
            CasaChat da Família
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600 dark:text-slate-300">
            Acesso rápido e simples: basta digitar seu nome e email para entrar na sala da família.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
              Seu Nome ou Apelido Familiar
            </Label>
            <Input
              id="name"
              placeholder="Ex: Mãe, Tio Beto, Luiza..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
              Seu Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="seuemail@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-xl"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status" className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
              Recado / Frase de Status
            </Label>
            <Input
              id="status"
              placeholder="Ex: No trabalho / Pronta pro almoço de domingo"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
              Escolha uma foto de perfil
            </Label>
            <div className="flex items-center gap-2 justify-between overflow-x-auto py-1">
              {AVATAR_PRESETS.map((preset, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setAvatarUrl(preset)}
                  className={`relative rounded-full transition-transform hover:scale-105 ${
                    avatarUrl === preset ? "ring-4 ring-emerald-500 ring-offset-2 scale-105" : "opacity-75"
                  }`}
                >
                  <img src={preset} alt="Avatar" className="w-10 h-10 rounded-full object-cover shadow-sm" />
                </button>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium shadow-md transition-all flex items-center justify-center gap-2"
          >
            {loginMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Entrando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Entrar no Chat da Família
              </>
            )}
          </Button>

          <p className="text-[11px] text-center text-slate-500">
            Nenhuma senha complicada é necessária. O email identifica cada membro da família.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
