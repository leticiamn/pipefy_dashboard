# Pipe Dashboard

App para o Pipefy, feito com o Apps Client SDK, em que cada usuário monta o próprio painel de gráficos sobre os cards de um pipe (pensado para ~20 mil cards). Abre como uma **pipe view**: uma aba própria dentro do pipe.

- Gráficos de barras, linha, pizza, número (KPI) e tabela.
- Agrupamento por fase, situação, etiqueta, responsável, data de criação ou conclusão e campos do pipe.
- Métricas: quantidade, soma ou média de campo numérico e dias até concluir.
- Filtros por fase, situação e período. Painel arrastável e redimensionável.
- Cache no próprio app, separado por usuário, e atualização incremental.

A arquitetura, as decisões e as limitações estão em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Como rodar

Requisitos: Node 20 ou mais novo.

```bash
npm install
npm test          # testes de agregação, sincronização e Worker
npm run dev       # servidor local em http://localhost:5173
```

### 1. Modo demo, fora do Pipefy

Abra http://localhost:5173/dashboard.html. Sem o Pipefy por perto, o app usa um cliente de demonstração com 20 mil cards gerados e latência simulada, para mostrar a carga, o cache e o construtor de visões. `?cards=5000` muda a quantidade.

### 2. Dentro do Pipefy, rodando local

O Pipefy carrega apps num iframe em HTTPS. Para testar localmente:

1. `npm run dev`
2. Em outro terminal, crie um túnel HTTPS: `cloudflared tunnel --url http://localhost:5173`
3. Em https://app.pipefy.com/developers/apps, clique em **Add new app** e informe `https://<endereço-do-túnel>/manifest.json`.
4. Abra o pipe, troque a visualização para **Dashboard**.

Sem o Worker publicado, o app faz a carga completa e a reconciliação diária, mas não recebe a lista de mudanças. Para apontar para um Worker já publicado, defina `VITE_CHANGES_URL` (veja `.env.example`).

### 3. Publicação no Cloudflare Workers (plano gratuito)

Um único Worker serve o app e a API de mudanças.

```bash
npx wrangler login
npx wrangler d1 create pipefy-dashboard          # copie o database_id para o wrangler.jsonc
npx wrangler d1 migrations apply pipefy-dashboard --remote
npx wrangler secret put WEBHOOK_SECRET           # um valor aleatório e longo
npm run deploy
```

Depois, registre o webhook do pipe com um token de **Service Account** (só uma vez):

```bash
PIPEFY_TOKEN=... PIPE_ID=307436009 \
WEBHOOK_URL="https://<seu-worker>.workers.dev/webhooks/pipefy/<WEBHOOK_SECRET>?pipeId=307436009" \
node scripts/register-webhook.mjs
```

Por fim, registre o app no Pipefy com `https://<seu-worker>.workers.dev/manifest.json`.

## Estrutura

```
src/
  init.ts                 página de entrada: registra a pipe view (PipefyApp.initCall)
  main.tsx                pipe view: PipefyApp.render, ou modo demo fora do Pipefy
  pipefy/                 SDK, consultas GraphQL e conversão dos cards
  data/                   cache IndexedDB por usuário e motor de sincronização
  analytics/              agregação (função pura) e Web Worker
  config/                 configuração do painel por usuário
  ui/                     painel, gráficos e construtor de visões
  mock/                   dados de demonstração
worker/                   Cloudflare Worker: arquivos do app, webhooks e /api/changes
scripts/register-webhook.mjs
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes (Vitest) |
| `npm run typecheck` | Checagem de tipos do app e do Worker |
| `npm run build` | Build de produção em `dist/` |
| `npm run worker:dev` | Worker local com `wrangler dev` (rode o build antes) |
| `npm run deploy` | Build e publicação no Cloudflare Workers |
