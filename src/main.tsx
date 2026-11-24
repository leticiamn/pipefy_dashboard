import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { demoClient } from './mock/mockClient';
import { type PipefyClient, sdkClient } from './pipefy/sdk';
import { App } from './ui/App';
import './ui/styles.css';

let mounted = false;
function mount(client: PipefyClient) {
  if (mounted) return;
  mounted = true;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App client={client} />
    </StrictMode>,
  );
}

const params = new URLSearchParams(window.location.search);
const insidePipefy = Boolean(window.PipefyApp && params.get('appID'));

if (insidePipefy) {
  // Pipe view: o Pipefy exige PipefyApp.render, senão volta para o Kanban.
  const PipefyApp = window.PipefyApp!;
  const p = PipefyApp.init();
  PipefyApp.render(() => mount(sdkClient(p, PipefyApp.registerListener?.bind(PipefyApp))));
} else {
  // Fora do Pipefy: modo demo com 20 mil cards gerados (?cards=5000 muda a quantidade).
  mount(demoClient(Number(params.get('cards')) || 20_000));
}
