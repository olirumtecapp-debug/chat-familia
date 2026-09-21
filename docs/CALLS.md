# Chamadas

Chamadas individuais de áudio e vídeo usam `RTCPeerConnection` no navegador. O cliente pede microfone sempre e câmera somente em chamadas de vídeo. Há controles para microfone, câmera e encerramento; estados de chamada incluem tocando, conectando, ativa, recusada, falha e encerrada.

## Sinalização

`calls.start` cria a chamada e impede que o destinatário seja colocado em duas chamadas ativas. `calls.respond` aceita ou recusa. Após aceite, o chamador cria a oferta SDP; o receptor responde; candidatos ICE são transportados por `call_signals`. Cada leitura é autorizada contra a chamada atual.

## STUN/TURN

O cliente usa `VITE_STUN_SERVER` ou `stun:stun.l.google.com:19302` como padrão. Para redes restritas, configure `VITE_TURN_SERVER`, `VITE_TURN_USERNAME` e `VITE_TURN_PASSWORD`. Nunca coloque credenciais TURN diretamente no código-fonte. No modelo atual, essas variáveis são necessárias no bundle do cliente para que o browser crie os ICE servers; em produção, prefira credenciais TURN de curta duração fornecidas por um endpoint seguro.

## Limites

Chamadas são individuais nesta versão. O histórico fica em `calls`, com timestamps, duração, tipo e status. Grupos, gravação de chamadas e E2EE permanecem extensões futuras.
