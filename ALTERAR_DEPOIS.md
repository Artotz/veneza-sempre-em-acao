# Itens para alterar depois

Este projeto foi reduzido ao esqueleto. Estes pontos ficaram com valores antigos e devem ser revisados por voce:

❌ Nome do app, short name e descricao do PWA em `vite.config.ts` (manifest).
❌ Cores do PWA no manifest (`theme_color`, `background_color`).
❌ Titulo e metadados em `index.html` (title, description, og:, twitter:, theme-color, lang).
✅ Icones e logos em `public/` (favicon.ico, favicon.png, apple-touch-icon.png, pwa-192x192.png, pwa-512x512.png, pwa-512x512-maskable.png, logo.svg).
❌ Imagem Open Graph referenciada em `index.html` (`/pwa-512x512.png`).
❌ Tokens de tema em `src/index.css` (cores customizadas), se quiser alinhar com a nova identidade.
