# Deploy

O projeto é um `web-db-user` gerenciado. O servidor de desenvolvimento atualiza automaticamente o preview; a publicação deve ser feita pelo fluxo de publicação do projeto depois de salvar um checkpoint. O build de produção executa `vite build` e empacota o servidor com esbuild.

## Variáveis

As variáveis de plataforma são injetadas pelo ambiente Manus. Consulte `.env.example` para as categorias documentadas. `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID`, URLs OAuth, credenciais de storage e tokens Forge não devem ser commitados.

Para chamadas em redes difíceis, configure STUN/TURN. Sem TURN, a conexão WebRTC ainda tenta STUN e funciona em muitos navegadores, mas redes simétricas podem exigir relay.

## Checklist pré-publicação

1. `pnpm check` sem erros.
2. `pnpm test` sem erros.
3. `pnpm build` sem falha.
4. Migrações aplicadas no banco do projeto.
5. `SELECT COUNT(*) FROM users` revisado; nenhum seed de teste.
6. Preview aberto em desktop e celular.
7. Login, onboarding, logout, nova conversa, texto, imagem, voz e chamadas verificados entre duas contas reais.
8. Checkpoint salvo antes de publicar.

A aplicação não contém um seed de demonstração. O primeiro acesso de uma família deve criar os perfis reais por OAuth.
