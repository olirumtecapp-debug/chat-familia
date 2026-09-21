# Armazenamento

Fotos de perfil, imagens e áudios ficam no storage S3 gerenciado via `storagePut`. O banco guarda `fileKey`, `fileUrl`, nome sanitizado, tamanho e MIME type; bytes não são colocados no MySQL.

`server/media.ts` aceita apenas MIME types de imagem e áudio definidos, decodifica data URI Base64, limita imagens a 8 MB e áudios a 12 MB, e gera uma chave opaca com `nanoid`. O nome original é usado apenas como metadado sanitizado.

Avatares são redimensionados/comprimidos no navegador antes do upload. Imagens de mensagem têm prévia, legenda opcional e visualização ampliada. Voz é gravada com `MediaRecorder` quando o navegador suporta e aparece com player Play/Pause.

As procedures de mensagem exigem participação na conversa antes de aceitar mídia. A URL interna `/manus-storage/...` é retornada pelo helper gerenciado e não deve ser montada manualmente. O framework assina o redirect de storage. Para remover avatar, o banco deixa de referenciar a chave; o storage gerenciado não expõe deleção física nesta integração.
