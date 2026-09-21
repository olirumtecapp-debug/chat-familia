# Variáveis de ambiente

Em um deploy Manus, os valores de plataforma são injetados no runtime e não devem ser copiados para o repositório. O projeto espera as seguintes categorias:

```dotenv
DATABASE_URL=mysql://usuario:senha@host:3306/chatforall
JWT_SECRET=seu-segredo-de-sessao
VITE_APP_ID=seu-app-id-manus
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im
CHATFORALL_FAMILY_CODE=seu-codigo-privado-com-8-ou-mais-caracteres
OWNER_OPEN_ID=
OWNER_NAME=
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=
VITE_FRONTEND_FORGE_API_KEY=
VITE_STUN_SERVER=stun:stun.l.google.com:19302
VITE_TURN_SERVER=
VITE_TURN_USERNAME=
VITE_TURN_PASSWORD=
TURN_SERVER=
TURN_SHARED_SECRET=
TURN_CREDENTIAL_TTL=3600
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=
```

`CHATFORALL_FAMILY_CODE` é obrigatório para novos logins locais e deve ser mantido apenas como secret. `DATABASE_URL`, `JWT_SECRET`, OAuth, storage e tokens Forge são fornecidos pelo ambiente gerenciado. Para coturn com credenciais efêmeras, configure `TURN_SERVER` e `TURN_SHARED_SECRET` no servidor; o endpoint autenticado `/api/calls/ice` cria credenciais HMAC com expiração. `TURN_CREDENTIAL_TTL` limita a validade em segundos. O cliente tem fallback de STUN público. Não committe valores reais: configure-os como secrets do projeto ou variáveis de ambiente do deploy.

A plataforma protege o arquivo `.env.example` do projeto contra edição direta para impedir vazamento acidental; este documento é a cópia versionada da configuração esperada e deve ser usado para recriar o arquivo em uma instalação externa.
