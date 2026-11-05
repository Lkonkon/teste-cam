# Gesto em Cena

Aplicativo desktop para Windows que usa a webcam e o MediaPipe Tasks para detectar
uma pessoa e reconhecer o gesto de silêncio (indicador próximo aos lábios). Quando
reconhecido, o gesto aciona a imagem configurada. O processamento de vídeo acontece
localmente; o app não grava o vídeo nem identifica a identidade da pessoa.

## Pré-requisitos

- Node.js e npm.
- Uma webcam para testar o reconhecimento.

## Executar em desenvolvimento

```powershell
npm install
npm run dev
```

O comando de desenvolvimento abre a interface no navegador. Para executar o
aplicativo desktop, gere primeiro o build e inicie o Electron:

```powershell
npm run build
npx electron .
```

## Gerar o instalador do Windows

```powershell
npm run package
```

O instalador NSIS e a versão extraída são criados na pasta `dist/`, que não faz
parte do controle de versão.

## Gesto e imagem

- A imagem padrão do gesto está em `public/images/silencio.png`.
- Os modelos de detecção de rosto e mãos estão em `public/models/`.
- Os arquivos WASM do MediaPipe são copiados para `public/wasm/` durante o build.
- Use **Trocar imagem** no app para escolher outra imagem para a sessão atual.
