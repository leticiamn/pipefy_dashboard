const ICON = './icon.svg';

window.PipefyApp?.initCall({
  'pipe-view': () => ({
    icon: ICON,
    text: 'Custom Dashboards',
    url: './dashboard.html',
  }),
});
