import { DECK_NONE } from './columns';

/*
 * Lógica pura de mazos (sin red): árbol de grupos, conteos diarios y qué fichas toca estudiar hoy.
 *
 * Cómo se decide qué sale hoy en cada mazo (como en Anki):
 *  - Nuevas: fichas nunca estudiadas. Hoy salen `new_per_day` menos las que ya se empezaron hoy.
 *  - Repasos: fichas ya estudiadas cuya fecha llegó. Hoy salen `max_reviews_per_day` menos los repasos ya hechos hoy.
 */

export const SEP = '::';
export const DEFAULT_NEW_PER_DAY = 20;
export const DEFAULT_MAX_REVIEWS = 200;

export interface DeckSettings {
  new_per_day: number;
  max_reviews_per_day: number;
}
export const DEFAULT_SETTINGS: DeckSettings = { new_per_day: DEFAULT_NEW_PER_DAY, max_reviews_per_day: DEFAULT_MAX_REVIEWS };

/** Columnas mínimas de cada ficha para calcular conteos y la cola de estudio. */
export interface StatRow {
  id: string;
  deck: string | null;
  created_at: string;
  interval_days: number;
  repetitions: number;
  review_count: number;
  due_at: string;
  introduced_at?: string | null;
  last_reviewed_at?: string | null;
}

/** Ficha nueva = nunca se ha calificado (todavía no tiene intervalo ni repeticiones). */
export const isNewCard = (c: Pick<StatRow, 'interval_days' | 'repetitions' | 'review_count'>): boolean =>
  (c.review_count ?? 0) === 0 && (c.interval_days ?? 0) === 0 && (c.repetitions ?? 0) === 0;

export interface DeckCounts {
  total: number;
  newTotal: number; // nuevas que existen
  dueTotal: number; // repasos vencidos que existen
  newToday: number; // nuevas que tocan hoy (con el límite aplicado)
  dueToday: number; // repasos que tocan hoy (con el límite aplicado)
}
export const ZERO_COUNTS: DeckCounts = { total: 0, newTotal: 0, dueTotal: 0, newToday: 0, dueToday: 0 };

export const sumCounts = (a: DeckCounts, b: DeckCounts): DeckCounts => ({
  total: a.total + b.total,
  newTotal: a.newTotal + b.newTotal,
  dueTotal: a.dueTotal + b.dueTotal,
  newToday: a.newToday + b.newToday,
  dueToday: a.dueToday + b.dueToday,
});

/** Inicio de hoy y de mañana (hora local), en milisegundos. */
function dayBounds(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** Cuántas nuevas y repasos tocan hoy en UN mazo. */
export function deckCounts(rows: StatRow[], s: DeckSettings, now: Date): DeckCounts {
  const { start, end } = dayBounds(now);
  let total = 0;
  let newTotal = 0;
  let dueTotal = 0;
  let introducedToday = 0;
  let reviewedToday = 0;

  for (const r of rows) {
    total++;
    const intro = ms(r.introduced_at);
    const last = ms(r.last_reviewed_at);
    if (intro !== null && intro >= start) introducedToday++;
    else if (last !== null && last >= start) reviewedToday++;

    if (isNewCard(r)) newTotal++;
    else if ((ms(r.due_at) ?? 0) < end) dueTotal++;
  }

  return {
    total,
    newTotal,
    dueTotal,
    newToday: Math.min(newTotal, Math.max(0, s.new_per_day - introducedToday)),
    dueToday: Math.min(dueTotal, Math.max(0, s.max_reviews_per_day - reviewedToday)),
  };
}

export const settingsFor = (map: Map<string, DeckSettings>, deck: string | null): DeckSettings =>
  (deck !== null && map.get(deck)) || DEFAULT_SETTINGS;

/** Conteos por mazo (clave `null` = fichas sin mazo). */
export function computeDeckCounts(
  rows: StatRow[],
  settings: Map<string, DeckSettings>,
  now: Date,
): Map<string | null, DeckCounts> {
  const groups = new Map<string | null, StatRow[]>();
  for (const r of rows) {
    const key = r.deck || null;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const out = new Map<string | null, DeckCounts>();
  for (const [deck, g] of groups) out.set(deck, deckCounts(g, settingsFor(settings, deck), now));
  return out;
}

/** ¿El mazo `deck` entra en el alcance `scope`? (null = todo; DECK_NONE = sin mazo; nombre = ese mazo y sus subgrupos) */
export const inScope = (deck: string | null, scope: string | null): boolean => {
  if (scope === null) return true;
  if (scope === DECK_NONE) return deck === null;
  return deck !== null && (deck === scope || deck.startsWith(scope + SEP));
};

export const scopeNames = (names: string[], scope: string): string[] => names.filter((n) => inScope(n, scope));

/**
 * IDs de las fichas que tocan hoy, en orden: primero los repasos (más atrasados primero) y luego las nuevas
 * (en el orden original del mazo). Cada mazo aplica sus propios límites.
 */
export function planStudy(
  rows: StatRow[],
  settings: Map<string, DeckSettings>,
  scope: string | null,
  now: Date,
): string[] {
  const { end } = dayBounds(now);
  const groups = new Map<string | null, StatRow[]>();
  for (const r of rows) {
    const key = r.deck || null;
    if (!inScope(key, scope)) continue;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const reviews: StatRow[] = [];
  const fresh: StatRow[] = [];
  for (const [deck, g] of groups) {
    const c = deckCounts(g, settingsFor(settings, deck), now);
    reviews.push(
      ...g
        .filter((r) => !isNewCard(r) && (ms(r.due_at) ?? 0) < end)
        .sort((a, b) => (ms(a.due_at) ?? 0) - (ms(b.due_at) ?? 0))
        .slice(0, c.dueToday),
    );
    fresh.push(
      ...g
        .filter(isNewCard)
        .sort((a, b) => (ms(b.created_at) ?? 0) - (ms(a.created_at) ?? 0)) // created_at decrece con la posición en Anki
        .slice(0, c.newToday),
    );
  }
  reviews.sort((a, b) => (ms(a.due_at) ?? 0) - (ms(b.due_at) ?? 0));
  return [...reviews, ...fresh].map((r) => r.id);
}

/* ───────────── Árbol de grupos ───────────── */

export interface DeckNode {
  name: string; // nombre completo: "Inglés::Refold"
  label: string; // último tramo: "Refold"
  depth: number;
  hasCards: boolean; // tiene fichas propias (si no, es solo un grupo)
  own: DeckCounts; // solo sus fichas
  agg: DeckCounts; // sus fichas + las de todos sus subgrupos
  children: DeckNode[];
}

export const parentOf = (name: string): string | null => {
  const i = name.lastIndexOf(SEP);
  return i >= 0 ? name.slice(0, i) : null;
};
export const labelOf = (name: string): string => {
  const i = name.lastIndexOf(SEP);
  return i >= 0 ? name.slice(i + SEP.length) : name;
};

const byLabel = (a: DeckNode, b: DeckNode) => a.label.localeCompare(b.label, 'es', { numeric: true, sensitivity: 'base' });

export function buildDeckTree(counts: Map<string | null, DeckCounts>): DeckNode[] {
  const nodes = new Map<string, DeckNode>();
  const roots: DeckNode[] = [];

  const ensure = (name: string): DeckNode => {
    const existing = nodes.get(name);
    if (existing) return existing;
    const node: DeckNode = {
      name,
      label: labelOf(name),
      depth: name.split(SEP).length - 1,
      hasCards: false,
      own: { ...ZERO_COUNTS },
      agg: { ...ZERO_COUNTS },
      children: [],
    };
    nodes.set(name, node);
    const parent = parentOf(name);
    if (parent !== null) ensure(parent).children.push(node);
    else roots.push(node);
    return node;
  };

  for (const [deck, c] of counts) {
    if (deck === null) continue;
    const n = ensure(deck);
    n.hasCards = c.total > 0;
    n.own = c;
  }

  const finish = (n: DeckNode) => {
    n.children.sort(byLabel);
    let agg = { ...n.own };
    for (const c of n.children) {
      finish(c);
      agg = sumCounts(agg, c.agg);
    }
    n.agg = agg;
  };
  roots.sort(byLabel);
  roots.forEach(finish);
  return roots;
}

export function findNode(tree: DeckNode[], name: string): DeckNode | null {
  for (const n of tree) {
    if (n.name === name) return n;
    if (name.startsWith(n.name + SEP)) {
      const found = findNode(n.children, name);
      if (found) return found;
    }
  }
  return null;
}

/** Todos los grupos intermedios que existen (para sugerirlos al mover un mazo). */
export function groupNames(names: string[]): string[] {
  const set = new Set<string>();
  for (const n of names) {
    let p = parentOf(n);
    while (p !== null) {
      set.add(p);
      p = parentOf(p);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}
