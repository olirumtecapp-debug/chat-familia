# ChatForAll — plano de migração segura de autenticação

Branch experimental. NÃO publicar na main antes da validação.

## Falhas confirmadas no código atual
- `auth.localLogin` e `auth.loginSimple` aceitam apenas e-mail/nome e emitem JWT sem validar senha.
- `localLogin.password` é opcional e ignorado no servidor.
- O frontend fabrica e-mails `@chat.creativeam.com.br` a partir de apelidos.
- Sessões existentes podem durar até um ano.
- `checkNickname.currentUserId` é informado pelo cliente e não prova propriedade da conta.

## Requisitos para liberar
1. Definir provedor de envio de e-mail e domínio remetente (variáveis de ambiente, nunca credenciais no Git).
2. Cadastro com e-mail real, senha obrigatória, hash resistente (Argon2id ou scrypt), confirmação por token único, expiração e limitação de tentativas.
3. Login somente com senha correta e e-mail confirmado; resposta genérica para usuário/senha inválidos, rate limiting.
4. Recuperação de senha via e-mail verificado, token de uso único e expiração.
5. Migração: contas legadas sem senha NÃO podem reivindicar conta apenas informando o e-mail. Enviar link de ativação para o e-mail real; contas de e-mail sintético precisam de fluxo assistido de recuperação de identidade, sem apropriação por terceiros.
6. Revogar sessões legadas emitidas por login sem senha; reduzir validade de novas sessões e manter cookies HttpOnly/Secure/SameSite. Não devolver JWT em respostas públicas nem gravar em localStorage.
7. Atualizar frontend e eventuais consumidores Android antes de desligar endpoints legados. Preservar IDs de usuário e vínculos de conversas, sem limpar banco.
8. Revisar endpoints públicos e fluxo de fallback de banco; garantir armazenamento persistente de credenciais, inclusive na infraestrutura de produção.
9. Testes automatizados: cadastro, verificação, login, senha errada, tentativa de assumir conta, recuperação, sessão antiga, rate limit, regressão mensagens/chamadas.
10. Rodar `pnpm check`, `pnpm test`, `pnpm build`; homologar em ambiente de testes com banco isolado e e-mail de teste. Só então avaliar merge e deploy Vercel.
