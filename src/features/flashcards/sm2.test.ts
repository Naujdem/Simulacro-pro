import { describe, expect, it } from 'vitest';
import { INITIAL_SM2, LEARN_AGAIN_MINUTES, describeInterval, formatDays, nextReview } from './sm2';

const now = new Date('2026-10-10T08:00:00');

describe('nextReview', () => {
  it('"Otra vez" vuelve en 1 minuto, no mañana', () => {
    const r = nextReview(INITIAL_SM2, 'again', now);
    expect(r.dueAt.getTime() - now.getTime()).toBe(LEARN_AGAIN_MINUTES * 60_000);
    expect(r).toMatchObject({ repetitions: 0, intervalDays: 1 });
  });

  it('en una ficha nueva, Bien da 1 día y el segundo acierto 6 días', () => {
    const first = nextReview(INITIAL_SM2, 'good', now);
    expect(first.intervalDays).toBe(1);
    expect(first.dueAt).toEqual(new Date('2026-10-11T00:00:00'));
    const second = nextReview(first, 'good', now);
    expect(second.intervalDays).toBe(6);
  });

  it('fallar una ficha madura la reinicia pero conserva la facilidad mínima', () => {
    const r = nextReview({ easeFactor: 1.3, intervalDays: 40, repetitions: 5 }, 'again', now);
    expect(r).toMatchObject({ repetitions: 0, intervalDays: 1, easeFactor: 1.3 });
  });
});

describe('etiquetas de intervalo', () => {
  it('formatDays', () => {
    expect(formatDays(1)).toBe('1 d');
    expect(formatDays(6)).toBe('6 d');
    expect(formatDays(30)).toBe('1 mes');
    expect(formatDays(60)).toBe('2 meses');
    expect(formatDays(365)).toBe('1 año');
    expect(formatDays(730)).toBe('2 años');
  });

  it('describeInterval: Mal (1 min), Bien (1 d)', () => {
    expect(describeInterval('again', nextReview(INITIAL_SM2, 'again', now))).toBe('1 min');
    expect(describeInterval('good', nextReview(INITIAL_SM2, 'good', now))).toBe('1 d');
    const mature = { easeFactor: 2.5, intervalDays: 10, repetitions: 4 };
    expect(describeInterval('good', nextReview(mature, 'good', now))).toBe('25 d');
  });
});
