# Banco de dados

## Tabelas

| Tabela | Responsabilidade |
| --- | --- |
| `users` | Identidade OAuth, perfil, presença e último acesso |
| `conversations` | Conversas diretas ou grupos; `directKey` evita duplicidade e `groupOwnerId` identifica o administrador principal |
| `conversation_members` | Relação de participantes, papel (`member`/`admin`) e cursor de leitura por pessoa |
| `messages` | Texto, imagem, áudio, documentos, metadados de arquivo e resposta futura |
| `message_status` | Status por destinatário: `sent`, `delivered`, `read` |
| `message_deletions` | Exclusão privada “para mim” sem apagar a história do outro membro |
| `calls` | Histórico e estado de chamadas de áudio/vídeo |
| `call_signals` | Oferta, resposta, ICE candidate e hangup transitórios |
| `typing_states` | Indicadores de digitação com expiração |

## Migrações

As migrações versionadas estão em `drizzle/0000_magical_jack_flag.sql`, `drizzle/0001_curly_the_call.sql` e `drizzle/0002_lowly_valkyrie.sql`. A primeira cria a tabela de autenticação. A segunda acrescenta perfil, conversas, mensagens, receipts, chamadas, sinais e typing. A terceira cria a exclusão por usuário.

Para alterar o modelo:

```bash
pnpm drizzle-kit generate
# revisar o SQL criado em drizzle/
pnpm drizzle-kit migrate
```

Não use a ferramenta SQL para inserir dados de demonstração. O banco entregue deve permanecer sem seed.

## Regras de acesso

Cada procedure protegida recebe `ctx.user`. Conversas e mensagens são consultadas somente após `assertMember`. Sinais são gravados e lidos somente por `callerId`/`receiverId` da chamada. Arquivos armazenam referências e URLs internas, nunca bytes em colunas. Exclusão para todos só é permitida ao autor dentro de 24 horas; exclusão para mim cria um registro isolado.

## Integridade e desempenho

Há chaves estrangeiras com cascade, chave única para `directKey`, chaves compostas em membros/status/exclusões e índices para atividade de conversa, histórico por data, participantes, sinais pendentes e expiração de typing. Histórico é limitado a 40 mensagens por requisição.
