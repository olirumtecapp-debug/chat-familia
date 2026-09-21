# Guia para continuidade no Antigravity

## Estado atual

O ChatForAll está implementado como aplicação web full-stack e publicado em preview pelo projeto Manus. O frontend React/Tailwind tem login local por nome/e-mail/código privado, onboarding, perfil, avatar, busca de pessoas, conversa direta e grupos com membros/admins, texto, imagens, documentos, voz por pressionar e soltar, receipts, typing, presença, notificações de navegador, SSE, tema claro/escuro e tela de chamadas. O logo fornecido está em storage gerenciado no caminho `/manus-storage/ChatForAll-Logo-cropped_4e47447c.png` e aplicado no login, header, favicon e metadados. O backend tRPC tem autorização por conversa e por chamada; o endpoint SSE é autenticado e o endpoint de ICE emite credenciais TURN efêmeras quando configurado. O banco foi migrado sem seed fictício.

## Onde alterar

- `client/src/pages/Home.tsx`: login local, layout do mensageiro, onboarding, perfil e composição.
- `client/src/components/CallDialog.tsx`: permissões de mídia e negociação WebRTC.
- `client/src/index.css`: tokens, responsividade e identidade visual.
- `server/routers/profile.ts`: perfil e busca.
- `server/routers/messaging.ts`: conversas, mensagens, mídia, receipts e typing.
- `server/routers/calls.ts`: ciclo de chamada e sinais.
- `server/localAuth.ts`: validação em tempo constante do código privado.
- `server/media.ts`: validação e upload.
- `drizzle/schema.ts`: modelo relacional.
- `drizzle/*.sql`: histórico de migrações.

Não altere `server/_core` sem entender o fluxo de OAuth e tRPC do template.

## Desenvolvimento

Rode `pnpm install`, `pnpm dev`, `pnpm check`, `pnpm test` e `pnpm build`. Ao mudar o schema, execute `pnpm drizzle-kit generate`, revise o SQL e rode `pnpm drizzle-kit migrate`. Não use SQL para inserir dados de teste no banco do projeto.

## Próximas evoluções

O próximo investimento recomendado é adicionar E2EE, push notifications, encaminhamento e bloqueio de contatos. SSE, grupos, documentos e TURN efêmero já estão implementados.

## Dependências externas

Storage depende do helper S3 gerenciado. Chamada direta depende de STUN; TURN é opcional, mas recomendado para produção. O browser precisa permitir cookies, microfone e câmera para os respectivos recursos.

O login atual não depende de Manus OAuth: configure o secret `CHATFORALL_FAMILY_CODE` com pelo menos oito caracteres. OAuth permanece apenas para compatibilidade com sessões antigas. O browser precisa permitir cookies, microfone e câmera para os respectivos recursos.

## Segurança

Nunca logue tokens, URLs de storage assinadas ou credenciais TURN. Preserve `protectedProcedure`, `assertMember` e a validação de `storeMedia`. Qualquer nova procedure de arquivo deve repetir a checagem de participante. Qualquer nova tabela deve ter FK, índice e migration revisada.
