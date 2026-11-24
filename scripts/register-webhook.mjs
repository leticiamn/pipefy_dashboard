// Uso: PIPEFY_TOKEN=... PIPE_ID=307436009 WORKER_URL=https://<worker> WEBHOOK_SECRET=... node scripts/register-webhook.mjs
const { PIPEFY_TOKEN, PIPE_ID, WORKER_URL, WEBHOOK_SECRET } = process.env;
if (!PIPEFY_TOKEN || !PIPE_ID || !WORKER_URL || !WEBHOOK_SECRET) {
  console.error('Defina PIPEFY_TOKEN, PIPE_ID, WORKER_URL e WEBHOOK_SECRET.');
  process.exit(1);
}

const query = `mutation DashboardCreateWebhook($input: CreateWebhookInput!) {
  createWebhook(input: $input) { webhook { id name url actions } }
}`;

const url = new URL('/webhooks/pipefy', WORKER_URL);
url.searchParams.set('pipeId', PIPE_ID);

const res = await fetch('https://api.pipefy.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PIPEFY_TOKEN}` },
  body: JSON.stringify({
    query,
    variables: {
      input: {
        pipe_id: PIPE_ID,
        name: 'pipe-dashboard-changes',
        url: url.toString(),
        headers: { 'X-Webhook-Secret': WEBHOOK_SECRET },
        actions: ['card.create', 'card.move', 'card.field_update', 'card.done', 'card.delete'],
      },
    },
  }),
});
console.log(JSON.stringify(await res.json(), null, 2));
