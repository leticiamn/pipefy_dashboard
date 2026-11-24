# Pipe Dashboard

App para o Pipefy, feito com o Apps Client SDK, em que cada usuário monta o próprio painel de gráficos sobre os cards de um pipe (pensado para ~20 mil cards). Abre como uma **pipe view**: uma aba própria dentro do pipe.

- Gráficos de colunas, barras horizontais, funil, linha, pizza, número (KPI) e tabela.
- Agrupamento por fase, situação, etiqueta, responsável, data de criação ou conclusão e campos do pipe.
- Métricas: quantidade, soma ou média de campo numérico e dias até concluir.
- Filtros por regras sobre qualquer campo (texto, número, data, fase e situação), no painel inteiro e em cada visão.
- Datas no fuso horário do perfil do usuário no Pipefy.
- Painel arrastável e redimensionável.
- Cache no próprio app, separado por usuário, e atualização incremental.

## Como rodar

Requisitos: Node 20.19 ou mais novo (o `.nvmrc` usa o 22).

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
4. Abra o pipe e troque a visualização para **Custom Dashboards**.

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
PIPEFY_TOKEN=... PIPE_ID=307436009 WEBHOOK_SECRET=... \
WORKER_URL="https://<seu-worker>.workers.dev" \
node scripts/register-webhook.mjs
```

O segredo vai no header `X-Webhook-Secret`. Se o Pipefy recusar headers no webhook, use o segredo no caminho (`/webhooks/pipefy/<segredo>?pipeId=...`), que o Worker também aceita.

Por fim, registre o app no Pipefy com `https://<seu-worker>.workers.dev/manifest.json`.

## Arquitetura

O app roda no navegador, dentro da pipe view do Pipefy. Os cards são lidos com `p.query` do SDK, que executa como o usuário logado e com as permissões dele, guardados no IndexedDB do navegador (uma base por usuário e por pipe) e agregados num Web Worker. Um Cloudflare Worker pequeno serve os arquivos do app, recebe os webhooks do pipe e informa quais cards mudaram.

```
Pipefy (API GraphQL, webhooks)
   │ p.query como o usuário            │ webhooks (card criado, movido, alterado, concluído, excluído)
   ▼                                   ▼
Navegador (pipe view)           Cloudflare Worker
  Sync ──► IndexedDB por usuário   D1: id do card + ação + hora
   ▲          │                    GET /api/changes (token de p.getAuthToken)
   │          ▼                        │
   │      Web Worker de agregação      │
   │          │                        │
   │      Painel e construtor ◄────────┘ ids alterados → busca só esses cards
```

### Decisões

| Decisão                                                | Motivo                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Ler os cards no navegador com `p.query`                | Respeita as permissões de cada usuário sem guardar token nenhum                                                                           |
| Cache em IndexedDB, uma base por usuário e pipe        | O case pede cache no app e separado por usuário; abre o painel na hora                                                                    |
| Agregação num Web Worker                               | Agrupar 20 mil cards fora da thread da tela; a interface recebe só o resultado                                                            |
| Worker de mudanças em vez de cache no servidor         | O evento `onCardUpdated` da pipe view só cobre vencimento e a API não filtra por data de alteração; guardar só ids cabe no plano gratuito |
| Validação do usuário no Worker pela API do Pipefy      | O token de `p.getAuthToken()` é testado com `me` e `pipe(id)`: só quem enxerga o pipe recebe a lista                                      |
| Configuração do painel em `p.set` (private)            | Acompanha a pessoa em qualquer navegador; cópia local no IndexedDB                                                                        |
| Datas no fuso do perfil (`me.timeZone`)                | Filtros e agrupamentos por dia, semana e mês batem com o que o usuário vê no Pipefy, em qualquer navegador                                |
| `allCards` com 50 por página e `operationName` em tudo | Menos chamadas que paginar por fase (30 por página) e consumo identificado no API Usage Stats                                             |
| Cloudflare Workers gratuito                            | Não desliga por ociosidade nem apaga dados; arquivos estáticos não gastam CPU                                                             |

### Volume e desempenho

- **Carga inicial:** `allCards` paginado por cursor, cerca de 400 páginas para 20 mil cards. O cursor fica salvo a cada página, então a carga continua de onde parou se a aba fechar. Os gráficos se atualizam a cada 10 páginas.
- **Atualização:** ao abrir, a cada 1 minuto com a tela visível e a cada evento da pipe view, o app pergunta ao Worker o que mudou e busca só esses cards (20 por consulta, com aliases). Cards excluídos ou que o usuário deixou de ver são removidos do cache.
- **Reconciliação:** uma recarga completa por dia, ou pelo botão "Atualizar tudo", corrige o que algum webhook tenha perdido.
- **Medições no modo demo** (20 mil cards, 120 ms de latência simulada por página): carga completa em cerca de 53 s; reabrir com cache em menos de 1 s; agregação de 20 mil cards em poucos milissegundos. No pipe real, os tempos dependem da latência da API e ainda não foram medidos.

### Segurança

- O app não altera cards: nenhuma `p.mutation`. A única escrita é a configuração do painel, nos dados privados do app (`p.set`).
- Nenhum token no código ou no repositório. O segredo do webhook fica em `wrangler secret`.
- O app só pode ser exibido dentro de `https://app.pipefy.com` (`frame-ancestors`).
- O Worker guarda só id de card, ação e hora, por 30 dias.
- O webhook é aceito só com o segredo (header `X-Webhook-Secret`, ou no caminho como alternativa), para pipes da lista `ALLOWED_PIPE_IDS`, com id de card numérico e ação conhecida.
- `/api/changes` exige o token do usuário, validado na API do Pipefy, e só responde CORS para as origens de `ALLOWED_ORIGINS` (em produção o app tem a mesma origem do Worker).
- A consulta de cards por id usa variáveis GraphQL, nunca ids concatenados no texto.

### Limitações

- Cada usuário faz a própria carga inicial no próprio navegador.
- Limpar os dados do navegador apaga o cache (a configuração do painel continua no Pipefy).
- Cards que o usuário não pode ver não aparecem: a contagem pode diferir da de um administrador, por desenho.
- O Pipefy não documenta o formato do token de `p.getAuthToken()`. Por isso o Worker não interpreta o token: só o repassa à API do Pipefy e aceita se `me` e `pipe(id)` responderem.
- Se o perfil não informar o fuso horário, o app usa o fuso do navegador.
- O funil por fase soma os cards das fases seguintes, ou seja, supõe que os cards avançam pelas fases em ordem.
- Com centenas de milhares de cards, a carga inicial em cada navegador ficaria lenta. Aí valeria agregar no servidor (Worker + D1 com token de Service Account), mas as permissões de cada usuário teriam de ser aplicadas pelo próprio servidor.

## Estrutura

```
src/
  init.ts                 página de entrada: registra a pipe view (PipefyApp.initCall)
  main.tsx                pipe view: PipefyApp.render, ou modo demo fora do Pipefy
  pipefy/                 SDK, consultas GraphQL e conversão dos cards
  data/                   cache IndexedDB por usuário e motor de sincronização
  analytics/              agregação e filtros (funções puras) e Web Worker
  config/                 configuração do painel por usuário
  lib/                    datas, fuso horário e validação de valores
  ui/                     painel, gráficos, filtros e construtor de visões
  mock/                   dados de demonstração
worker/                   Cloudflare Worker: arquivos do app, webhooks e /api/changes
scripts/register-webhook.mjs
```

## Scripts

| Comando              | O que faz                                            |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`        | Servidor de desenvolvimento                          |
| `npm test`           | Testes (Vitest)                                      |
| `npm run typecheck`  | Checagem de tipos do app e do Worker                 |
| `npm run build`      | Build de produção em `dist/`                         |
| `npm run worker:dev` | Worker local com `wrangler dev` (rode o build antes) |
| `npm run deploy`     | Build e publicação no Cloudflare Workers             |
