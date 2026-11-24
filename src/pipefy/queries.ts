// Todas as consultas têm nome (operationName) para aparecerem identificadas no API Usage Stats do Pipefy.
// Só os campos que os gráficos usam: menos campos, menos complexidade por página.

export const PAGE_SIZE = 50;

export const CARD_FIELDS = /* GraphQL */ `
  fragment DashboardCardFields on Card {
    id
    title
    createdAt
    updated_at
    finished_at
    due_date
    done
    current_phase { id name }
    labels { name }
    assignees { name }
    fields { field { id type } value }
  }
`;

export const PIPE_META = /* GraphQL */ `
  query DashboardPipeMeta($pipeId: ID!) {
    me { id name }
    pipe(id: $pipeId) {
      id
      name
      phases { id name fields { id label type } }
      start_form_fields { id label type }
      labels { id name }
    }
  }
`;

/** Separada da PIPE_META: se a contagem falhar, o app continua funcionando. */
export const PIPE_COUNTS = /* GraphQL */ `
  query DashboardPipeCounts($pipeId: ID!) {
    pipe(id: $pipeId) {
      cards_count
      phases { id name cards_count }
    }
  }
`;

export const ALL_CARDS = /* GraphQL */ `
  query DashboardAllCards($pipeId: ID!, $after: String) {
    allCards(pipeId: $pipeId, first: ${PAGE_SIZE}, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { ...DashboardCardFields } }
    }
  }
  ${CARD_FIELDS}
`;

/** Busca vários cards por id numa consulta só, com aliases (c0, c1, ...). */
export function cardsByIdQuery(ids: string[]): string {
  const parts = ids.map((id, i) => `c${i}: card(id: ${JSON.stringify(id)}) { ...DashboardCardFields }`);
  return `query DashboardCardsById {\n${parts.join('\n')}\n}\n${CARD_FIELDS}`;
}

export interface RawCard {
  id: string;
  title: string;
  createdAt: string;
  updated_at?: string | null;
  finished_at?: string | null;
  due_date?: string | null;
  done?: boolean | null;
  current_phase?: { id: string; name: string } | null;
  labels?: Array<{ name: string }> | null;
  assignees?: Array<{ name: string }> | null;
  fields?: Array<{ field: { id: string; type: string }; value: string | null }> | null;
}

export interface AllCardsResponse {
  allCards: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: RawCard }>;
  };
}

export interface FieldMeta {
  id: string;
  label: string;
  type: string;
}

export interface PipeMetaResponse {
  me: { id: string; name: string };
  pipe: {
    id: string;
    name: string;
    phases: Array<{ id: string; name: string; fields?: FieldMeta[] | null }>;
    start_form_fields?: FieldMeta[] | null;
    labels?: Array<{ id: string; name: string }> | null;
  };
}

export interface PipeCountsResponse {
  pipe: { cards_count: number; phases: Array<{ id: string; name: string; cards_count: number }> };
}
