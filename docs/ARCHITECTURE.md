# Arquitetura

## Visão geral

O app roda no navegador, dentro da pipe view do Pipefy. Os cards são lidos com `p.query` do SDK, que executa como o usuário logado e com as permissões dele, guardados no IndexedDB do navegador (uma base por usuário e por pipe) e agregados num Web Worker. Um Cloudflare Worker pequeno serve os arquivos do app, recebe os webhooks do pipe e informa quais cards mudaram.

```
Pipefy (API GraphQL, webhooks)
   │ p.query como o usuário            │ webhooks (card criado, movido, alterado, excluído)
   ▼                                   ▼
Navegador (pipe view)           Cloudflare Worker
  Sync ──► IndexedDB por usuário   D1: id do card + ação + hora
   ▲          │                    GET /api/changes (token de p.getAuthToken)
   │          ▼                        │
   │      Web Worker de agregação      │
   │          │                        │
   │      Painel e construtor ◄────────┘ ids alterados → busca só esses cards
```

## Decisões

| Decisão | Motivo |
| --- | --- |
| Ler os cards no navegador com `p.query` | Respeita as permissões de cada usuário sem guardar token nenhum |
| Cache em IndexedDB, uma base por usuário e pipe | O case pede cache no app e separado por usuário; abre o painel na hora |
| Agregação num Web Worker | Agrupar 20 mil cards fora da thread da tela; a interface recebe só o resultado |
| Worker de mudanças em vez de cache no servidor | O evento `onCardUpdated` da pipe view só cobre vencimento e a API não filtra por data de alteração; guardar só ids cabe no plano gratuito |
| Validação do usuário no Worker pela API do Pipefy | O token de `p.getAuthToken()` é testado com `me` e `pipe(id)`: só quem enxerga o pipe recebe a lista |
| Configuração do painel em `p.set` (private) | Acompanha a pessoa em qualquer navegador; cópia local no IndexedDB |
| `allCards` com 50 por página e `operationName` em tudo | Menos chamadas que paginar por fase (30 por página) e consumo identificado no API Usage Stats |
| Cloudflare Workers gratuito | Não desliga por ociosidade nem apaga dados; arquivos estáticos não gastam CPU |

## Volume e desempenho

- **Carga inicial:** `allCards` paginado por cursor, cerca de 400 páginas para 20 mil cards. O cursor fica salvo a cada página, então a carga continua de onde parou se a aba fechar. Os gráficos se atualizam a cada 10 páginas.
- **Atualização:** ao abrir, a cada 1 minuto com a tela visível e a cada evento da pipe view, o app pergunta ao Worker o que mudou e busca só esses cards (20 por consulta, com aliases). Cards excluídos ou que o usuário deixou de ver são removidos do cache.
- **Reconciliação:** uma recarga completa por dia, ou pelo botão "Atualizar tudo", corrige o que algum webhook tenha perdido.
- **Medições no modo demo** (20 mil cards, 120 ms de latência simulada por página): carga completa em cerca de 53 s; reabrir com cache em menos de 1 s; agregação de 20 mil cards em poucos milissegundos. Os tempos no pipe real dependem da latência da API e serão medidos.

## Segurança

- O app só lê: nenhuma `p.mutation`.
- Nenhum token no código ou no repositório. O segredo do webhook fica em `wrangler secret`.
- O app só pode ser exibido dentro de `https://app.pipefy.com` (`frame-ancestors`).
- O Worker guarda só id de card, ação e hora, por 30 dias.
- O webhook é aceito só com o segredo na URL e para pipes da lista `ALLOWED_PIPE_IDS`.

## Limitações

- Cada usuário faz a própria carga inicial no próprio navegador.
- Limpar os dados do navegador apaga o cache (a configuração do painel continua no Pipefy).
- Cards que o usuário não pode ver não aparecem: a contagem pode diferir da de um administrador, por desenho.
- O formato do token de `p.getAuthToken()` não é documentado; a validação pela API ainda precisa ser confirmada no pipe real.
- Os nomes dos campos da consulta de cards e das ações de webhook seguem a documentação e precisam ser conferidos no pipe real.
- Pipes muito maiores pediriam agregação no servidor (Worker + D1 com token de Service Account).
