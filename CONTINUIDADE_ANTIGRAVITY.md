# CONTINUIDADE PARA ANTIGRAVITY — Chat Família
Data: 2026-11-09
Branch de revisão: `fix/auditoria-estabilidade-chat-20261109`
Base: `main`
Status: **alterações parciais, NÃO fazer deploy/merge automático**.

## Objetivo
Manter integralmente cores, logo, identidade visual, fluxo de APK e configuração de backend. Priorizar segurança, estabilidade, busca de usuários, envio de mensagens e reconexão. Não reescrever o aplicativo.

## O que foi alterado nesta branch
1. `server/routers.ts`: removido o endpoint público `auth.resetAllData`, que permitia apagar usuários e mensagens sem autenticação.
2. `api/index.js`: removido o mesmo endpoint da implementação de deploy Vercel. **Importante:** este arquivo parece ser um bundle gerado; confirmar pipeline de build antes de publicar.
3. `client/src/pages/Home.tsx`: removido o hook da função de reset, alterado o tratamento de erro de SSE para permitir a reconexão automática nativa do EventSource, e rejeitado envio de mensagem vazia.

## Riscos CRÍTICOS ainda pendentes
- `auth.localLogin` recebe `password`, mas não valida a senha; `auth.loginSimple` também cria sessão a partir de e-mail fornecido. É possível risco de acesso à conta de terceiros. **NÃO publicar para usuários reais sem corrigir o mecanismo de autenticação e definir migração segura para contas existentes.**
- `server/db.ts` alterna automaticamente MySQL/Firestore mock; `server/mockDb.ts` replica tabelas inteiras, pode perder consistência em ambiente distribuído. Auditar dados existentes e fazer backup ANTES de qualquer migração.
- `profile.search` com consulta vazia retorna apenas contatos de conversas existentes, enquanto com texto pesquisa outros usuários. Diferenciar explicitamente descoberta de pessoas vs contatos já adicionados.
- `client/src/components/ChatWindow.tsx` é uma implementação legada, mas a rota principal usa `Home.tsx`. Não apagar sem verificar imports e build. O campo de legenda de anexo pode ser confundido com compositor duplicado; reproduzir no Android antes de mudar.
- `messaging.send` não possui idempotência de envio; avaliar `clientMessageId` único e restrição no banco, preservando compatibilidade.
- `server/realtime.ts` usa Set em memória: eventos SSE não atravessam instâncias. Polling é fallback atual.

## Plano de homologação / próximos passos
1. Comparar branch com main; revisar os diffs e garantir que a remoção de reset não quebrou o build.
2. Rodar `npm install`, `npm run check`, `npm test`, `npm run build` conforme scripts existentes; registrar resultados.
3. Confirmar qual código serve `/api/trpc` em produção e sincronizar a fonte com o artefato gerado; não editar bundles manualmente na etapa de release.
4. Implementar autenticação real com validação server-side e migração planejada; proteger endpoints administrativos.
5. Corrigir pesquisa/identificação de contatos e testar dois usuários reais em aparelhos distintos.
6. Reproduzir duplicação visual do campo no APK, com screenshots e teclado aberto/fechado; fazer correção CSS/componente mínima.
7. Testar envio, recebimento, mensagens repetidas, mídia, grupos, chamadas, reinício, rede intermitente, reconexão, exclusão e bloqueio.
8. Confirmar que pipeline GitHub → backend → APK continua intacto e que não houve mudança nas cores/logo.
9. Após testes e aprovação do usuário, fazer merge e gerar APK pelo processo já configurado no Antigravity.

## Instrução de segurança
Não executar `resetAllData`, não limpar banco, não migrar dados sem backup, não fazer deploy nem merge automático. Esta branch é uma proposta de correções iniciais, não uma versão homologada.
