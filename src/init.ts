// Página de entrada do app (init_url do manifest). Só registra as features; não tem interface.
const ICON = './icon.svg';

window.PipefyApp?.initCall({
  'pipe-view': () => ({
    icon: ICON,
    text: 'Dashboard',
    url: './dashboard.html',
  }),
});
