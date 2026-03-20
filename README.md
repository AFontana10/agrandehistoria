# A Grande História — Deploy & Mobile

Este repositório contém a versão web do app "A Grande História". Aqui estão passos rápidos para publicar e transformar em app móvel.

## Publicar (GitHub Pages)

1. Abra o repositório em GitHub: `https://github.com/AFontana10/agrandehistoria`
2. Vá em **Settings → Pages** (ou Settings → Code and automation → Pages).
3. Em **Source**, selecione `main` e `/ (root)`, clique **Save**.
4. Aguarde alguns minutos — o site ficará disponível em `https://AFontana10.github.io/agrandehistoria/`.

## Tornar PWA instalável (Android/iOS)

- Já incluí `manifest.json`, meta tags para iOS e um `sw.js` (service worker) básico.
- Para funcionar corretamente em todos os dispositivos, gere ícones PNG nos tamanhos `192x192` e `512x512` a partir dos arquivos SVG em `img/`.

### Gerar PNGs localmente (recomendado)

Instale o `pwa-asset-generator` (Node.js):

```bash
npm install -g pwa-asset-generator
cd /caminho/para/o/projeto
pwa-asset-generator img/icon-192.svg img --favicon
# isso criará icon-192.png, icon-512.png e favicons em ./img
```

Adicione os arquivos gerados ao repositório e `git commit`.

## Gerar APK/IPA (opcional)

Se quiser publicar nas lojas, use Capacitor:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli --save
npx cap init AgrandeHistoria com.example.agrandehistoria --web-dir=.
npx cap add android
# abrir Android Studio: npx cap open android
```

## Observações
- O service worker atual é simples; ajuste políticas de cache conforme necessário.
- Se quiser, eu posso habilitar GitHub Pages para você (se preferir eu executo com `gh`).
