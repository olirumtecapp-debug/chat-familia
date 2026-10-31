# Ponto de Continuidade - ChatForAll

**Data:** 31/10/2026 (16h58)
**Produção:** `https://chat.creativeam.com.br`
**Commit:** `52ba45c` (branch `main`)

### Resumo das Implementações:
1. **Banco de Dados Zerado e Isolado:**
   - Removido código de recriação de usuários fictícios em `server/_core/sdk.ts`.
   - Implementado versionamento `20261031_02` em `server/mockDb.ts` para descartar caches legados de instâncias serverless.
   - Habilitado suporte completo a `db.delete(tabela)` sem condição `where`.
2. **Sessão & Cadastro Limpos:**
   - Em `useAuth.ts`, erros de token ou sessão inválida limpam automaticamente `app_session_id`, `chat_session_token` e recarregam para o estado limpo.
   - A tela inicial renderiza `<Welcome />` com a aba "Criar Conta" ativa por padrão.
3. **Busca e Conversas:**
   - `profile.search` retorna todos os usuários ativos instantaneamente para início de chat com 1 clique.
4. **Testes & Build:**
   - 27 testes unitários passando (`npm test`).
   - Build de produção gerado e implantado.
