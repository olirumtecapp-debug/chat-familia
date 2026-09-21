# Arquitetura

## Visão geral

ChatForAll é uma aplicação web de processo único no runtime gerenciado. O cliente React fala com o backend Express exclusivamente por tRPC. O backend valida sessão, autorização e payloads antes de consultar o banco ou gravar mídia. O MySQL/TiDB guarda metadados e relacionamentos; os bytes de fotos, imagens e áudios ficam no armazenamento S3 gerenciado do Manus.

## Frontend

A área principal é um mensageiro responsivo com duas colunas no desktop e navegação de tela cheia no celular. A lista de conversas é atualizada por consulta periódica curta; o histórico é carregado em páginas de 40 mensagens e a consulta anterior usa cursor temporal. O tema claro é o padrão; o modo escuro reutiliza os mesmos tokens CSS.

## Backend e contratos

`server/routers/profile.ts` trata identidade, perfil, busca, heartbeat e avatar. `server/routers/messaging.ts` trata conversas diretas, histórico, envio, receipts, digitação e exclusão. `server/routers/calls.ts` trata ciclo de chamada e sinalização WebRTC. `server/routers.ts` compõe os routers e deixa os procedimentos protegidos atrás de `protectedProcedure`.

## Realtime

O deploy padrão é stateless/serverless, portanto a primeira versão usa refetch curto no cliente sobre dados persistidos: mensagens, presença, typing state, chamadas pendentes e sinais WebRTC. Não depende de um processo WebSocket residente. Essa decisão evita manter estado em memória e continua funcionando após cold starts; ver [REALTIME.md](./REALTIME.md).

## Fluxo de mensagem

O cliente envia texto ou data URI de uma mídia. O backend confirma que o remetente é membro da conversa, valida o tipo/tamanho, grava bytes no storage se necessário, insere uma linha em `messages`, cria status do destinatário e atualiza `conversations.updatedAt`. O cliente invalida a lista e o histórico, o que entrega a mudança sem refresh manual.

## Fluxo de chamada

O backend cria uma linha em `calls`. Os participantes consultam a chamada pendente, o destinatário aceita ou recusa, e os candidatos SDP/ICE transitam por `call_signals` com autorização por call id e participante. O browser usa `RTCPeerConnection` com STUN por padrão e TURN opcional. Consulte [CALLS.md](./CALLS.md).

## Evolução

O modelo já separa conversa, membros, mensagens, status, mídia e chamadas. Isso permite adicionar grupos, encaminhamento, documentos, notificações push ou criptografia de ponta a ponta sem reescrever a autorização central.
