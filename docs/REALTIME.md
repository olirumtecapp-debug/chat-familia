# Realtime

O canal principal usa SSE autenticado em `/api/realtime`, com eventos publicados quando mensagens, grupos ou chamadas mudam. O cliente invalida apenas os dados necessários ao receber o evento. O refetch curto permanece como fallback para cold starts, múltiplas instâncias ou reconexão: a lista consulta a cada 2,5 segundos, o histórico a cada 2 segundos, presença/heartbeat a cada 30 segundos, typing a cada 1,5 segundo e chamadas/sinais em menos de 1 segundo.

## Mensagens

O envio grava a mensagem no banco antes de retornar sucesso. O cliente invalida histórico e lista de conversas após o retorno. O contador de não lidas usa `lastReadAt` por membro; abrir uma conversa chama `acknowledge` e atualiza receipts.

## Presença

O navegador envia heartbeat autenticado. Usuários com `lastSeen` inferior a 70 segundos são apresentados como online; depois disso a interface mostra “visto por último” com data/hora local.

## Digitação

`typing_states` armazena apenas a expiração de um estado curto. Parar de digitar remove a linha; mesmo se o cliente perder uma requisição, a consulta ignora estados expirados em cinco segundos.

## Notificações e reconexão

Se permitido pelo navegador e a aba estiver oculta, uma nova mensagem aciona `Notification`. Erros de rede deixam os hooks tRPC em erro/retry e o próximo refetch reconcilia o estado persistido. Para escala maior, o mesmo contrato pode ser adaptado a SSE/WebSocket sem alterar as tabelas ou autorização.
