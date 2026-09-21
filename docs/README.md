# ChatForAll

ChatForAll é um mensageiro privado full-stack para conversas diretas e grupos, com perfis, imagens, documentos, mensagens de voz por pressionar e soltar, presença, notificações de navegador, SSE e chamadas individuais de áudio e vídeo. O produto utiliza login local por nome/e-mail/código privado da família, banco relacional MySQL/TiDB e armazenamento de arquivos gerenciado. O logotipo fornecido está aplicado no login, cabeçalho e favicon.

## Início rápido

1. Instale Node.js 22+ e pnpm 10+.
2. Copie `.env.example` para `.env` somente no desenvolvimento local. Em ambientes Manus, as variáveis de plataforma já são injetadas.
3. Instale as dependências com `pnpm install`.
4. Gere e aplique as migrações com `pnpm drizzle-kit generate` e `pnpm drizzle-kit migrate`.
5. Inicie o servidor com `pnpm dev`.
6. Abra a URL exibida pelo servidor.

O projeto usa React 19 + Vite + Tailwind 4 no frontend, Express 4 + tRPC 11 no backend e Drizzle ORM para o banco. Os contratos são compartilhados por tipos TypeScript, portanto a interface consome os procedimentos tRPC sem wrappers REST paralelos.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento com hot reload |
| `pnpm check` | Verificação TypeScript |
| `pnpm test` | Testes Vitest |
| `pnpm build` | Build do frontend e backend de produção |
| `pnpm drizzle-kit generate` | Gera SQL a partir de `drizzle/schema.ts` |
| `pnpm drizzle-kit migrate` | Aplica migrações no banco configurado |

## Estrutura

`client/src/pages/Home.tsx` contém a experiência do mensageiro, onboarding e perfis. `client/src/components/CallDialog.tsx` contém a negociação WebRTC no navegador. `server/routers/` separa perfil, mensagens e chamadas. `server/media.ts` concentra validação e upload de dados de mídia. `drizzle/schema.ts` é a fonte de verdade das tabelas.

## Estado inicial

Nenhum usuário, mensagem, conversa, avatar ou arquivo demonstrativo é criado por scripts de seed. A conta que aparece em um preview autenticado é a identidade real da sessão Manus que abriu o projeto, criada automaticamente pelo fluxo de OAuth.

## Continuidade

Leia [ARCHITECTURE.md](./ARCHITECTURE.md) antes de ampliar o produto. Para mudanças de banco, siga [DATABASE.md](./DATABASE.md); para chamadas, siga [CALLS.md](./CALLS.md). O roteiro completo de continuidade para outro agente está em [ANTIGRAVITY.md](./ANTIGRAVITY.md).
