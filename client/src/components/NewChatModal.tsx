import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_AVATAR } from "@/lib/emojiAvatars";
import { trpc } from "@/lib/trpc";
import { Loader2, MessageSquare, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (id: number) => void;
}

export function NewChatModal({ isOpen, onClose, onSelectConversation }: NewChatModalProps) {
  const [tab, setTab] = useState<"direct" | "group">("direct");
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);

  const utils = trpc.useUtils();
  const usersQuery = trpc.users.list.useQuery(undefined, { enabled: isOpen });

  const directMutation = trpc.conversations.startDirect.useMutation({
    onSuccess: (data) => {
      utils.conversations.list.invalidate();
      onSelectConversation(data.conversationId);
      onClose();
      toast.success("Conversa aberta!");
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao iniciar conversa");
    },
  });

  const groupMutation = trpc.conversations.createGroup.useMutation({
    onSuccess: (data) => {
      utils.conversations.list.invalidate();
      onSelectConversation(data.conversationId);
      onClose();
      toast.success("Grupo criado com sucesso!");
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao criar grupo");
    },
  });

  const toggleUserSelection = (userId: number) => {
    setSelectedUsers((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.error("Informe o nome do grupo");
      return;
    }
    if (selectedUsers.length === 0) {
      toast.error("Selecione pelo menos um membro para o grupo");
      return;
    }

    groupMutation.mutate({
      name: groupName.trim(),
      description: groupDesc.trim(),
      memberUserIds: selectedUsers,
    });
  };

  const otherUsers = (usersQuery.data || []).filter((u) => !u.isSelf);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px] p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            {tab === "direct" ? (
              <>
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                Nova Conversa
              </>
            ) : (
              <>
                <Users className="w-5 h-5 text-emerald-600" />
                Novo Grupo da Família
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Converse diretamente ou reúna todo mundo para combinar almoços e eventos.
          </DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl my-2">
          <button
            type="button"
            onClick={() => setTab("direct")}
            className={`py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === "direct"
                ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Conversa Individual
          </button>
          <button
            type="button"
            onClick={() => setTab("group")}
            className={`py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === "group"
                ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Criar Grupo
          </button>
        </div>

        {tab === "direct" ? (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-medium text-slate-500">Selecione quem você deseja chamar:</p>
            {usersQuery.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : otherUsers.length === 0 ? (
              <div className="text-center py-6 bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-dashed">
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">Nenhum outro parente entrou ainda.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Peça para eles acessarem o link e digitarem seu nome e email!
                </p>
              </div>
            ) : (
              <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1">
                {otherUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => directMutation.mutate({ targetUserId: u.id })}
                    disabled={directMutation.isPending}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                  >
                    <img
                      src={u.avatarUrl || DEFAULT_AVATAR}
                      alt={u.name || "Parente"}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{u.name}</p>
                      <p className="text-xs text-slate-400 truncate">{u.statusMessage || u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleCreateGroup} className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Nome do Grupo</Label>
              <Input
                placeholder="Ex: Família Silva Reunida 🍕"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="h-10 rounded-xl text-sm"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Descrição (opcional)</Label>
              <Input
                placeholder="Ex: Avisos, fotos de viagens e churrascos"
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                className="h-10 rounded-xl text-sm"
              />
            </div>

            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Selecione os Membros da Família
              </Label>
              <div className="max-h-[160px] overflow-y-auto space-y-1.5 border rounded-xl p-2 bg-slate-50 dark:bg-slate-900">
                {otherUsers.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-2">Nenhum outro membro cadastrado ainda.</p>
                ) : (
                  otherUsers.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => toggleUserSelection(u.id)}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedUsers.includes(u.id)}
                        onCheckedChange={() => toggleUserSelection(u.id)}
                      />
                      <img
                        src={u.avatarUrl || DEFAULT_AVATAR}
                        alt={u.name || ""}
                        className="w-7 h-7 rounded-full object-cover ml-1"
                      />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{u.name}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Button
              type="submit"
              disabled={groupMutation.isPending || selectedUsers.length === 0}
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold mt-2"
            >
              {groupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Grupo Familiar"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
