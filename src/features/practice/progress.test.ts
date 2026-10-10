import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearProgress,
  lastSlotFor,
  loadProgress,
  pendingProgress,
  saveProgress,
  setLastSlot,
  setProgressUser,
  type SavedProgress,
} from './progress';

// Almacenamiento falso (el entorno de pruebas no tiene localStorage)
const fake = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
};

const NOW = 1_800_000_000_000;
const sample = (over: Partial<SavedProgress> = {}): SavedProgress => ({
  v: 1,
  examId: 'e1',
  slot: 'full',
  mode: 'full',
  questionIds: ['a', 'b', 'c', 'd', 'e'],
  allIds: ['a', 'b', 'c', 'd', 'e'],
  results: [
    { questionId: 'a', response: { type: 'true_false', value: true }, correct: true, timeMs: 1000 },
    { questionId: 'b', response: { type: 'short_answer', text: 'x' }, correct: false, timeMs: 2000 },
  ],
  elapsedMs: 3000,
  savedAt: NOW,
  ...over,
});

let store: ReturnType<typeof fake>;
beforeEach(() => {
  store = fake();
  setProgressUser('u1');
});

describe('progress', () => {
  it('guarda y recupera el avance (pregunta 3 de 5 tras responder 2)', () => {
    saveProgress(sample(), store);
    const p = loadProgress('e1', 'full', NOW, store)!;
    expect(p.results).toHaveLength(2);
    expect(p.questionIds).toHaveLength(5);
    expect(pendingProgress('e1', 'full', NOW, store)).toEqual({ done: 2, total: 5 });
  });

  it('cada slot es independiente: el repaso no pisa el simulacro completo', () => {
    saveProgress(sample(), store);
    saveProgress(sample({ slot: 'wrong', mode: 'custom', questionIds: ['x', 'y'], allIds: ['x', 'y'], results: [] }), store);
    expect(loadProgress('e1', 'full', NOW, store)!.questionIds).toHaveLength(5);
    expect(loadProgress('e1', 'wrong', NOW, store)!.questionIds).toEqual(['x', 'y']);
  });

  it('cada usuario tiene el suyo en el mismo dispositivo', () => {
    saveProgress(sample(), store);
    setProgressUser('u2');
    expect(loadProgress('e1', 'full', NOW, store)).toBeNull();
    setProgressUser('u1');
    expect(loadProgress('e1', 'full', NOW, store)).not.toBeNull();
  });

  it('recuerda la última sesión para continuarla al recargar la página', () => {
    saveProgress(sample(), store);
    expect(lastSlotFor('e1', store)).toBe('full');
    expect(lastSlotFor('otro', store)).toBeNull();
    setLastSlot('e1', 'wrong', store);
    expect(lastSlotFor('e1', store)).toBe('wrong');
  });

  it('al borrar el avance también se olvida como "última sesión"', () => {
    saveProgress(sample(), store);
    clearProgress('e1', 'full', store);
    expect(loadProgress('e1', 'full', NOW, store)).toBeNull();
    expect(lastSlotFor('e1', store)).toBeNull();
  });

  it('descarta el avance vencido (más de 30 días)', () => {
    saveProgress(sample(), store);
    expect(loadProgress('e1', 'full', NOW + 31 * 24 * 3600 * 1000, store)).toBeNull();
    expect([...store.raw.keys()].some((k) => k.endsWith(':e1:full'))).toBe(false); // y lo limpia
  });

  it('descarta datos dañados o inconsistentes en vez de romper', () => {
    store.setItem('simulapro:progress:v1:u1:e1:full', '{no es json');
    expect(loadProgress('e1', 'full', NOW, store)).toBeNull();

    saveProgress(sample({ results: [{ questionId: 'zzz', response: { type: 'true_false', value: true }, correct: true, timeMs: 1 }] }), store);
    expect(loadProgress('e1', 'full', NOW, store)).toBeNull(); // la respuesta no corresponde a la pregunta de esa posición
  });

  it('no hay "pendiente" si ya se respondió todo', () => {
    const all = sample().questionIds.map((id) => ({ questionId: id, response: { type: 'true_false', value: true } as const, correct: true, timeMs: 1 }));
    saveProgress(sample({ results: all }), store);
    expect(loadProgress('e1', 'full', NOW, store)).not.toBeNull(); // sirve para reintentar el guardado final
    expect(pendingProgress('e1', 'full', NOW, store)).toBeNull();
  });

  it('sin almacenamiento disponible no falla', () => {
    expect(() => saveProgress(sample(), null)).not.toThrow();
    expect(loadProgress('e1', 'full', NOW, null)).toBeNull();
    expect(lastSlotFor('e1', null)).toBeNull();
  });
});
