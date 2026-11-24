// Registra o webhook do pipe apontando para o Worker. Rode uma vez, com um token de Service Account.
// Uso: PIPEFY_TOKEN=... PIPE_ID=307436009 WEBHOOK_URL="https://<worker>/webhooks/pipefy/<segredo>?pipeId=307436009" node scripts/register-webhook.mjs
const { PIPEFY_TOKEN, PIPE_ID, WEBHOOK_URL } = process.env;
if (!PIPEFY_TOKEN || !PIPE_ID || !WEBHOOK_URL) {
  console.error('Defina PIPEFY_TOKEN, PIPE_ID e WEBHOOK_URL.');
  process.exit(1);
}

const query = `mutation DashboardCreateWebhook($input: CreateWebhookInput!) {
  createWebhook(input: $input) { webhook { id name url actions } }
}`;

const res = await fetch('https://api.pipefy.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PIPEFY_TOKEN}` },
  body: JSON.stringify({
    query,
    variables: {
      input: {
        pipe_id: PIPE_ID,
        name: 'pipe-dashboard-changes',
        url: WEBHOOK_URL,
        actions: ['card.create', 'card.move', 'card.field_update', 'card.done', 'card.delete'],
      },
    },
  }),
});
console.log(JSON.stringify(await res.json(), null, 2));
