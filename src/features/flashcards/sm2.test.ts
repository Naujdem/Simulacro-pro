import { describe, expect, it } from 'vitest';
import { INITIAL_SM2, LEARNING_STEPS, RELEARN_STEPS, describeInterval, formatDays, formatMinutes, nextReview, phaseOf, type Rating } from './sm2';

const now = new Date('2026-10-10T08:00:00');

const labels = (state: Parameters<typeof nextReview>[0]) =>
  (['again', 'hard', 'good', 'easy'] as Rating[]).map((r) => describeInterval(nextReview(state, r, now)));

describe('ficha nueva (pasos de aprendizaje)', () => {
  it('los cuatro botones muestran 1 min, 6 min, 10 min y 1 d', () => {
    expect(labels(INITIAL_SM2)).toEqual(['1 min', '6 min', '10 min', '1 d']);
  });

  it('"Bien" pasa al paso de 10 min y la ficha sigue aprendiéndose', () => {
    const r = nextReview(INITIAL_SM2, 'good', now);
    expect(r).toMatchObject({ repetitions: 0, intervalDays: 0, step: 1, delayMinutes: LEARNING_STEPS[1] });
    expect(r.dueAt.getTime() - now.getTime()).toBe(10 * 60_000);
  });

  it('en el paso de 10 min: Otra vez 1 min, Difícil 15 min, Bien 1 d, Fácil 1 d', () => {
    expect(labels({ ...INITIAL_SM2, step: 1 })).toEqual(['1 min', '15 min', '1 d', '1 d']);
  });

  it('terminar los pasos pasa la ficha a días (queda para mañana)', () => {
    const r = nextReview({ ...INITIAL_SM2, step: 1 }, 'good', now);
    expect(r).toMatchObject({ repetitions: 1, intervalDays: 1 });
    expect(r.delayMinutes).toBeUndefined();
    expect(r.dueAt).toEqual(new Date('2026-10-11T00:00:00'));
  });

  it('"Otra vez" vuelve en 1 min y no cambia la facilidad', () => {
    const r = nextReview({ ...INITIAL_SM2, step: 1 }, 'again', now);
    expect(r).toMatchObject({ step: 0, delayMinutes: 1, easeFactor: 2.5, intervalDays: 0 });
  });
});

describe('ficha de repaso (los intervalos crecen)', () => {
  it('desde 1 día: 10 min, 2 d, 3 d, 4 d (siempre Difícil < Bien < Fácil)', () => {
    expect(labels({ easeFactor: 2.5, intervalDays: 1, repetitions: 1 })).toEqual(['10 min', '2 d', '3 d', '4 d']);
  });

  it('con intervalos largos muestra días y meses', () => {
    expect(labels({ easeFactor: 2.5, intervalDays: 9, repetitions: 4 })).toEqual(['10 min', '11 d', '23 d', '29 d']);
    expect(labels({ easeFactor: 2.5, intervalDays: 44, repetitions: 6 })).toEqual(['10 min', '1,8 meses', '3,7 meses', '4,8 meses']);
  });

  it('"Bien" aumenta el intervalo en cada repaso', () => {
    let state = nextReview({ ...INITIAL_SM2, step: 1 }, 'good', now); // 1 d
    const seen = [state.intervalDays];
    for (let i = 0; i < 4; i++) {
      state = nextReview(state, 'good', now);
      seen.push(state.intervalDays);
    }
    expect(seen).toEqual([1, 3, 8, 20, 50]);
  });

  it('fallar una ficha madura la manda a 10 min, la deja en 1 día y conserva la facilidad mínima', () => {
    const r = nextReview({ easeFactor: 1.3, intervalDays: 40, repetitions: 5 }, 'again', now);
    expect(r).toMatchObject({ repetitions: 0, intervalDays: 1, easeFactor: 1.3, delayMinutes: RELEARN_STEPS[0] });
    expect(r.dueAt.getTime() - now.getTime()).toBe(10 * 60_000);
  });

  it('"Bien" y "Fácil" ajustan la facilidad; "Difícil" la baja', () => {
    const s = { easeFactor: 2.5, intervalDays: 10, repetitions: 3 };
    expect(nextReview(s, 'good', now).easeFactor).toBe(2.5);
    expect(nextReview(s, 'easy', now).easeFactor).toBe(2.6);
    expect(nextReview(s, 'hard', now).easeFactor).toBe(2.36);
  });
});

describe('ficha fallada (reaprendiendo)', () => {
  const lapsed = { easeFactor: 2.0, intervalDays: 1, repetitions: 0 };

  it('detecta la etapa según lo que se guarda', () => {
    expect(phaseOf(INITIAL_SM2)).toBe('learning');
    expect(phaseOf(lapsed)).toBe('relearning');
    expect(phaseOf({ intervalDays: 3, repetitions: 2 })).toBe('review');
  });

  it('Otra vez y Difícil se quedan en minutos; Bien y Fácil vuelven a días', () => {
    expect(labels(lapsed)).toEqual(['10 min', '15 min', '1 d', '2 d']);
  });
});

describe('etiquetas de intervalo', () => {
  it('formatDays', () => {
    expect(formatDays(1)).toBe('1 d');
    expect(formatDays(6)).toBe('6 d');
    expect(formatDays(30)).toBe('1 mes');
    expect(formatDays(57)).toBe('1,9 meses');
    expect(formatDays(60)).toBe('2 meses');
    expect(formatDays(365)).toBe('1 año');
    expect(formatDays(730)).toBe('2 años');
  });

  it('formatMinutes', () => {
    expect(formatMinutes(1)).toBe('1 min');
    expect(formatMinutes(10)).toBe('10 min');
    expect(formatMinutes(90)).toBe('1,5 h');
  });
});
