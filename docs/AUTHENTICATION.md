# Autenticação

O login principal do ChatForAll é local e não depende de validação no Manus. A pessoa informa nome, e-mail e o código privado da família. O servidor valida o código com comparação em tempo constante, normaliza o e-mail, cria ou atualiza a identidade local e emite um cookie de sessão JWT assinado pelo `JWT_SECRET`.

O código é configurado pelo segredo `CHATFORALL_FAMILY_CODE`; ele não fica no frontend, no banco, no ZIP ou na documentação pública. A configuração atual é um segredo gerenciado do projeto. O código deve ser compartilhado somente com pessoas autorizadas da família.

Cada identidade local recebe um `openId` determinístico derivado por hash do e-mail, mantendo compatibilidade com a tabela `users` e com conversas já existentes. Se o e-mail já existir por uma sessão Manus anterior, o login local reutiliza a mesma conta para não duplicar mensagens ou membros.

O fluxo Manus OAuth continua disponível no backend para compatibilidade com sessões antigas, mas não é mais apresentado na tela de entrada. Não há senha local nem confirmação de e-mail nesta modalidade; o código privado é o fator de acesso da família.

Todas as operações de produto usam `protectedProcedure`. `ctx.user` é a fonte de identidade; a interface não manipula cookies nem tokens. Logout chama `auth.logout`, que limpa o cookie de sessão com as opções seguras do framework.

Recuperação de sessão é automática: reabrir a aplicação com o cookie válido chama `auth.me`, então a pessoa volta ao próprio perfil. Se o navegador bloquear cookies, o OAuth não poderá funcionar; use um navegador com cookies habilitados.

O produto não cria contas fictícias. O banco só registra a pessoa que realmente concluir o login.
