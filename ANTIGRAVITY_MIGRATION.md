# ChatForAll — pacote de migração para Antigravity

## Conteúdo

Este pacote contém o código-fonte completo do ChatForAll, frontend React, backend Express/tRPC, schema Drizzle, migrações SQL, testes automatizados, documentação técnica e os assets do logo. Dependências geradas, `dist`, `.git`, logs e segredos não fazem parte do arquivo.

## Ordem recomendada de migração

1. Extraia `chatforall-export.zip` e entre na pasta `chatforall`.
2. Instale Node.js 22 e pnpm 10.
3. Copie `.env.example` para `.env` e preencha `DATABASE_URL`, `JWT_SECRET`, `FAMILY_ACCESS_CODE` e os valores de storage. Nunca publique o arquivo `.env`.
4. Execute `pnpm install`.
5. Crie o banco MySQL/TiDB vazio.
6. Aplique as migrações, em ordem, com `pnpm drizzle-kit migrate`. Os arquivos estão em `drizzle/0000_*.sql` até `drizzle/0003_*.sql`.
7. Execute `pnpm test`, `pnpm check` e `pnpm build`.
8. Inicie localmente com `pnpm dev` e verifique login, conversa, imagem, áudio e vídeo.
9. Para produção, execute `pnpm build` e `pnpm start`, expondo a porta configurada em `PORT`.

## Funcionalidades incluídas

O projeto inclui login local por nome, e-mail e código privado, conversas diretas e grupos, texto, imagens, documentos, mensagens de voz, recibos, presença, digitação, notificações, SSE, chamadas WebRTC de áudio/vídeo, storage gerenciado e marca ChatForAll.

## Observações de infraestrutura

Para chamadas WebRTC confiáveis em redes móveis, configure um servidor TURN e `TURN_SHARED_SECRET` ou adapte o endpoint de credenciais efêmeras. O servidor deve suportar conexões HTTPS e o frontend precisa de permissão de microfone/câmera no navegador.

O código de acesso familiar não deve ser colocado no repositório. Gere um valor novo no ambiente de destino. O banco contém apenas as identidades e dados do aplicativo; não há seed fictício obrigatório.

## Critérios de aceite

- `pnpm test` termina sem falhas.
- `pnpm check` termina sem erros TypeScript.
- `pnpm build` gera `dist`.
- O logo aparece no login e no cabeçalho.
- Uma imagem enviada continua visível após recarregar.
- Um áudio `audio/webm;codecs=opus` é enviado e reproduzido.
- Uma chamada WebRTC abre e pode ser encerrada sem deixar o estado preso.
- O login rejeita código familiar incorreto.

## Documentação adicional

Consulte `docs/ANTIGRAVITY.md`, `docs/README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/AUTHENTICATION.md`, `docs/REALTIME.md`, `docs/CALLS.md`, `docs/STORAGE.md`, `docs/DEPLOYMENT.md` e `docs/ENVIRONMENT.md`.
