import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_AVATAR, GROUP_AVATAR } from "@/lib/emojiAvatars";
import { trpc } from "@/lib/trpc";
import { Loader2, LogOut, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

interface Member {
  id: number;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string | null;
  statusMessage?: string | null;
}

interface GroupMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number;
  groupName: string;
  groupAvatar?: string;
  currentUserId: number;
  members: Member[];
  onMemberRemoved?: () => void;
}

export function GroupMembersModal({
  isOpen,
  onClose,
  conversationId,
  groupName,
  groupAvatar,
  currentUserId,
  members,
  onMemberRemoved,
}: GroupMembersModalProps) {
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);

  const utils = trpc.useUtils();
  const allUsersQuery = trpc.users.list.useQuery(undefined, { enabled: isOpen });

  const removeMemberMutation = trpc.conversations.removeMember.useMutation({
    onSuccess: (_, vars) => {
      utils.conversations.get.invalidate({ conversationId });
      utils.conversations.list.invalidate();
      utils.messages.list.invalidate({ conversationId });

      if (vars.targetUserId === currentUserId) {
        toast.success("Você saiu do grupo.");
        onClose();
        if (onMemberRemoved) onMemberRemoved();
      } else {
        toast.success(`${memberToRemove?.name || "Membro"} foi removido(a) do grupo.`);
        setMemberToRemove(null);
      }
    },
    onError: (err) => {
      toast.error(err.message || "Não foi possível remover o membro");
      setMemberToRemove(null);
    },
  });

  const addMemberMutation = trpc.conversations.addMember.useMutation({
    onSuccess: () => {
      utils.conversations.get.invalidate({ conversationId });
      utils.conversations.list.invalidate();
      utils.messages.list.invalidate({ conversationId });
      toast.success("Parente adicionado ao grupo com sucesso!");
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao adicionar membro");
    },
  });

  const memberIds = new Set(members.map((m) => m.id));
  const availableUsersToAdd = (allUsersQuery.data || []).filter((u) => !memberIds.has(u.id));

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto p-5 sm:p-6 rounded-2xl">
          <DialogHeader className="text-left pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <img
                src={groupAvatar || GROUP_AVATAR}
                alt={groupName}
                className="w-12 h-12 rounded-full object-cover ring-2 ring-emerald-500 shadow-sm"
              />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-bold text-slate-800 dark:text-white truncate">
                  {groupName}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                  {members.length} {members.length === 1 ? "participante" : "participantes"} na família
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Participantes Atuais */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-600" />
                Membros do Grupo ({members.length})
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[220px] overflow-y-auto pr-1">
              {members.map((member) => {
                const isSelf = member.id === currentUserId;
                const isAdmin = member.role === "admin";

                return (
                  <div
                    key={member.id}
                    className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 rounded-xl px-2 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={member.avatarUrl || DEFAULT_AVATAR}
                        alt={member.name || "Membro"}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {member.name || "Membro da Família"}
                          </p>
                          {isSelf && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">
                              Você
                            </span>
                          )}
                          {isAdmin && (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <ShieldCheck className="w-3 h-3" /> Admin
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate">{member.email || "Conectado"}</p>
                      </div>
                    </div>

                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => setMemberToRemove(member)}
                        className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
                        title="Remover este usuário do grupo"
                      >
                        <UserMinus className="w-4 h-4" />
                        <span className="hidden sm:inline">Excluir</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Adicionar Parentes Disponíveis */}
          {availableUsersToAdd.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
                Adicionar Outro Familiar ao Grupo
              </span>

              <div className="max-h-[140px] overflow-y-auto space-y-1.5 pr-1">
                {availableUsersToAdd.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={user.avatarUrl || DEFAULT_AVATAR}
                        alt={user.name || ""}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {user.name}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      onClick={() =>
                        addMemberMutation.mutate({
                          conversationId,
                          targetUserId: user.id,
                        })
                      }
                      disabled={addMemberMutation.isPending}
                      className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium"
                    >
                      + Adicionar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Botão de Sair do Grupo */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsLeaveDialogOpen(true)}
              className="w-full h-10 border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sair deste Grupo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Confirmação para Excluir Usuário */}
      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent className="sm:max-w-[400px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-900 dark:text-white">
              Remover do Grupo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              Tem certeza que deseja remover <strong>{memberToRemove?.name}</strong> do grupo{" "}
              <strong>{groupName}</strong>? Ele(a) não verá mais as mensagens deste grupo até ser adicionado(a)
              novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl text-xs h-9">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (memberToRemove) {
                  removeMemberMutation.mutate({
                    conversationId,
                    targetUserId: memberToRemove.id,
                  });
                }
              }}
              disabled={removeMemberMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs h-9 font-semibold"
            >
              {removeMemberMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Sim, Remover"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de Confirmação para Sair do Grupo */}
      <AlertDialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
        <AlertDialogContent className="sm:max-w-[400px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-900 dark:text-white">
              Sair do Grupo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              Tem certeza que deseja sair do grupo <strong>{groupName}</strong>? Você deixará de receber as mensagens
              deste grupo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl text-xs h-9">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                removeMemberMutation.mutate({
                  conversationId,
                  targetUserId: currentUserId,
                });
              }}
              disabled={removeMemberMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs h-9 font-semibold"
            >
              {removeMemberMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Sim, Sair do Grupo"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
