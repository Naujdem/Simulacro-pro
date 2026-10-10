import { describe, expect, it } from 'vitest';
import { DECK_NONE } from './columns';
import {
  DEFAULT_SETTINGS,
  buildDeckTree,
  computeDeckCounts,
  deckCounts,
  findNode,
  groupNames,
  inScope,
  isNewCard,
  parentOf,
  planStudy,
  type DeckSettings,
  type StatRow,
} from './decks';
import { pickNext } from './studySession';

const now = new Date('2026-10-10T08:00:00');
const today = (h: number) => new Date(`2026-10-10T0${h}:00:00`).toISOString();
const yesterday = new Date('2026-10-09T09:00:00').toISOString();
const tomorrow = new Date('2026-10-11T00:00:00').toISOString();

let n = 0;
const row = (o: Partial<StatRow> = {}): StatRow => ({
  id: `c${++n}`,
  deck: 'A',
  created_at: new Date(2026, 0, 1, 0, 0, 0, 1000 - n).toISOString(), // n mayor → created_at menor (orden de Anki)
  interval_days: 0,
  repetitions: 0,
  review_count: 0,
  due_at: yesterday,
  ...o,
});
const newCards = (k: number, deck = 'A') => Array.from({ length: k }, () => row({ deck }));
const dueCards = (k: number, deck = 'A') =>
  Array.from({ length: k }, () => row({ deck, interval_days: 5, repetitions: 3, review_count: 3, due_at: yesterday }));
const s = (new_per_day: number, max_reviews_per_day: number): DeckSettings => ({ new_per_day, max_reviews_per_day });

describe('conteos diarios', () => {
  it('isNewCard distingue nuevas de estudiadas', () => {
    expect(isNewCard(row())).toBe(true);
    expect(isNewCard(row({ review_count: 1, interval_days: 1 }))).toBe(false);
  });

  it('solo salen new_per_day nuevas, no las 1000', () => {
    const c = deckCounts(newCards(1000), s(20, 200), now);
    expect(c).toMatchObject({ total: 1000, newTotal: 1000, newToday: 20, dueToday: 0 });
  });

  it('las nuevas que ya empezaste hoy descuentan del límite', () => {
    const started = Array.from({ length: 5 }, () =>
      row({ interval_days: 1, review_count: 1, repetitions: 1, due_at: tomorrow, introduced_at: today(7), last_reviewed_at: today(7) }),
    );
    const c = deckCounts([...newCards(100), ...started], s(20, 200), now);
    expect(c.newToday).toBe(15);
  });

  it('el máximo de repasos descuenta los ya hechos hoy', () => {
    const doneToday = Array.from({ length: 50 }, () =>
      row({ interval_days: 8, repetitions: 4, review_count: 4, due_at: tomorrow, last_reviewed_at: today(7), introduced_at: yesterday }),
    );
    const c = deckCounts([...dueCards(300), ...doneToday], s(20, 200), now);
    expect(c).toMatchObject({ dueTotal: 300, dueToday: 150 });
  });

  it('un límite de 0 apaga las nuevas', () => {
    expect(deckCounts(newCards(10), s(0, 200), now).newToday).toBe(0);
  });

  it('las repasos de fechas futuras no cuentan como vencidos', () => {
    const future = row({ interval_days: 9, repetitions: 3, review_count: 3, due_at: new Date('2026-10-20T00:00:00').toISOString() });
    expect(deckCounts([future], DEFAULT_SETTINGS, now).dueTotal).toBe(0);
  });
});

describe('planStudy', () => {
  it('repasos primero (más atrasados antes) y luego nuevas, respetando los límites por mazo', () => {
    const rows = [...newCards(30, 'A'), ...dueCards(3, 'A'), ...newCards(30, 'B')];
    const settings = new Map([['A', s(5, 2)], ['B', s(4, 200)]]);
    const ids = planStudy(rows, settings, null, now);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const picked = ids.map((id) => byId.get(id)!);
    expect(picked.filter((r) => !isNewCard(r))).toHaveLength(2); // máx. 2 repasos en A
    expect(picked.filter((r) => isNewCard(r) && r.deck === 'A')).toHaveLength(5);
    expect(picked.filter((r) => isNewCard(r) && r.deck === 'B')).toHaveLength(4);
    // los repasos van antes que cualquier nueva
    expect(picked.slice(0, 2).every((r) => !isNewCard(r))).toBe(true);
  });

  it('las nuevas salen en el orden original del mazo', () => {
    const rows = newCards(5);
    expect(planStudy(rows, new Map(), null, now).slice(0, 3)).toEqual([rows[0].id, rows[1].id, rows[2].id]);
  });

  it('estudiar un grupo incluye sus subgrupos, y "sin mazo" solo las sueltas', () => {
    const rows = [...newCards(2, 'Inglés::Refold'), ...newCards(2, 'Inglés::Verbos'), ...newCards(2, 'Inglés2'), ...newCards(2, null as unknown as string)];
    rows.forEach((r) => {
      if (r.deck === (null as unknown as string)) r.deck = null;
    });
    expect(planStudy(rows, new Map(), 'Inglés', now)).toHaveLength(4);
    expect(planStudy(rows, new Map(), 'Inglés::Refold', now)).toHaveLength(2);
    expect(planStudy(rows, new Map(), DECK_NONE, now)).toHaveLength(2);
    expect(planStudy(rows, new Map(), null, now)).toHaveLength(8);
  });

  it('inScope no confunde "Inglés" con "Inglés2"', () => {
    expect(inScope('Inglés2', 'Inglés')).toBe(false);
    expect(inScope('Inglés::A', 'Inglés')).toBe(true);
  });
});

describe('árbol de grupos', () => {
  const rows = [...newCards(10, 'Inglés::Refold'), ...newCards(4, 'Inglés::Verbos'), ...newCards(3, 'Química')];
  const tree = buildDeckTree(computeDeckCounts(rows, new Map(), now));

  it('agrupa por "::" y suma los grupos', () => {
    expect(tree.map((t) => t.label)).toEqual(['Inglés', 'Química']);
    const ingles = tree[0];
    expect(ingles.hasCards).toBe(false);
    expect(ingles.children.map((c) => c.label)).toEqual(['Refold', 'Verbos']);
    expect(ingles.agg.total).toBe(14);
    expect(ingles.agg.newToday).toBe(14);
  });

  it('findNode, parentOf y groupNames', () => {
    expect(findNode(tree, 'Inglés::Verbos')?.own.total).toBe(4);
    expect(findNode(tree, 'No existe')).toBeNull();
    expect(parentOf('Inglés::Verbos')).toBe('Inglés');
    expect(parentOf('Química')).toBeNull();
    expect(groupNames(['A::B::C', 'A::D', 'E'])).toEqual(['A', 'A::B']);
  });
});

describe('pickNext (sesión de estudio)', () => {
  it('prioriza una ficha "Otra vez" cuyo minuto ya pasó', () => {
    const r = pickNext(['q1', 'q2'], [{ card: 'L', due: 1000 }], 2000);
    expect(r.current).toBe('L');
    expect(r.queue).toEqual(['q1', 'q2']);
  });

  it('si el minuto aún no pasa, sigue con la cola', () => {
    const r = pickNext(['q1'], [{ card: 'L', due: 5000 }], 2000);
    expect(r.current).toBe('q1');
    expect(r.learning).toHaveLength(1);
  });

  it('sin cola, muestra la de "Otra vez" aunque falte tiempo; sin nada, null', () => {
    expect(pickNext([], [{ card: 'L', due: 5000 }], 2000).current).toBe('L');
    expect(pickNext([], [], 2000).current).toBeNull();
  });
});
