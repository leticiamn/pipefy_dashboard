import type { RawCard } from '../pipefy/queries';

/** Gerador determinístico (mesma semente, mesmos dados) para o modo demo e os testes. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_PHASES = [
  { id: 'ph-1', name: 'Caixa de entrada' },
  { id: 'ph-2', name: 'Triagem' },
  { id: 'ph-3', name: 'Em análise' },
  { id: 'ph-4', name: 'Aguardando cliente' },
  { id: 'ph-5', name: 'Aprovado' },
  { id: 'ph-6', name: 'Concluído' },
];

export const DEMO_FIELDS = [
  { id: 'nome_contato', label: 'Nome Contato', type: 'short_text' },
  { id: 'email', label: 'Email', type: 'email' },
  { id: 'empresa', label: 'Empresa', type: 'short_text' },
  { id: 'cidade', label: 'Cidade', type: 'short_text' },
  { id: 'estado', label: 'Estado', type: 'short_text' },
  { id: 'valor_total', label: 'Valor Total', type: 'number' },
  { id: 'data_limite', label: 'Data Limite', type: 'date' },
];

const LABELS = ['Urgente', 'Cliente VIP', 'Retrabalho', 'Novo cliente', 'Renovação'];
const PEOPLE = ['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Melo', 'Elisa Rocha', 'Felipe Nunes', 'Gabriela Reis'];
const EMPRESAS = [
  'Cyberdyne S.A.',
  'Acme Ltda.',
  'Umbrella Corp.',
  'Initech',
  'Globex',
  'Stark Indústrias',
  'Wayne Holding',
  'Soylent',
  'Hooli',
  'Vandelay',
  'Wonka',
  'Tyrell',
];
const CIDADES: Array<[string, string]> = [
  ['Porto Alegre', 'RS'],
  ['Caxias do Sul', 'RS'],
  ['São Paulo', 'SP'],
  ['Campinas', 'SP'],
  ['Rio de Janeiro', 'RJ'],
  ['Belo Horizonte', 'MG'],
  ['Curitiba', 'PR'],
  ['Florianópolis', 'SC'],
  ['Salvador', 'BA'],
  ['Recife', 'PE'],
  ['Brasília', 'DF'],
];

function pick<T>(r: () => number, list: T[]): T {
  return list[Math.floor(r() * list.length)];
}

export function generateCards(count: number, seed = 42, now = Date.UTC(2026, 10, 20)): RawCard[] {
  const r = rng(seed);
  const cards: RawCard[] = [];
  const span = 540 * 86_400_000;
  for (let i = 0; i < count; i++) {
    const created = now - Math.floor(r() * r() * span);
    const age = (now - created) / span;
    const phaseIdx = Math.min(DEMO_PHASES.length - 1, Math.floor(age * 6 + r() * 2.5));
    const phase = DEMO_PHASES[phaseIdx];
    const done = phase.id === 'ph-6';
    const finished = done ? created + Math.floor((2 + r() * 40) * 86_400_000) : null;
    const labels = LABELS.filter(() => r() < 0.18);
    const assignees = [pick(r, PEOPLE), ...(r() < 0.15 ? [pick(r, PEOPLE)] : [])];
    cards.push({
      id: String(900000000 + i),
      title: `Pedido #${10000 + i}`,
      createdAt: new Date(created).toISOString(),
      updated_at: new Date(finished ?? created + Math.floor(r() * 5 * 86_400_000)).toISOString(),
      finished_at: finished ? new Date(Math.min(finished, now)).toISOString() : null,
      due_date: null,
      done,
      current_phase: phase,
      labels: labels.map((name) => ({ name })),
      assignees: [...new Set(assignees)].map((name) => ({ name })),
      fields: (() => {
        const [cidade, estado] = pick(r, CIDADES);
        const limite = new Date(now + Math.floor((r() * 540 - 60) * 86_400_000));
        const br = `${String(limite.getUTCDate()).padStart(2, '0')}/${String(limite.getUTCMonth() + 1).padStart(2, '0')}/${limite.getUTCFullYear()}`;
        return [
          { field: { id: 'nome_contato', type: 'short_text' }, value: pick(r, PEOPLE) },
          { field: { id: 'empresa', type: 'short_text' }, value: pick(r, EMPRESAS) },
          { field: { id: 'cidade', type: 'short_text' }, value: cidade },
          { field: { id: 'estado', type: 'short_text' }, value: estado },
          { field: { id: 'valor_total', type: 'number' }, value: (1000 + r() * r() * 2_000_000).toFixed(2) },
          { field: { id: 'data_limite', type: 'date' }, value: br },
        ];
      })(),
    });
  }
  return cards;
}
