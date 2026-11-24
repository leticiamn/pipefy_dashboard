import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { demoClient } from './mock/mockClient';
import { type PipefyClient, sdkClient } from './pipefy/sdk';
import { App } from './ui/App';
import './ui/styles.css';

let mounted = false;
function mount(client: PipefyClient) {
  const root = document.getElementById('root');
  if (mounted || !root) return;
  mounted = true;
  createRoot(root).render(
    <StrictMode>
      <App client={client} />
    </StrictMode>,
  );
}

const params = new URLSearchParams(window.location.search);
const PipefyApp = params.get('appID') ? window.PipefyApp : undefined;

if (PipefyApp) {
  // Pipe view: o Pipefy exige PipefyApp.render, senão volta para o Kanban.
  const p = PipefyApp.init();
  PipefyApp.render(() => mount(sdkClient(p, PipefyApp.registerListener?.bind(PipefyApp))));
} else {
  mount(demoClient(Number(params.get('cards')) || 20_000));
}
