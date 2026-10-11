import { describe, expect, it } from 'vitest';
import { availableQuestions, minLibraries, pickRandom, shuffle } from './surprise';

const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

describe('shuffle / pickRandom', () => {
  it('conserva los mismos elementos y no toca la lista original', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(src, seeded(7));
    expect([...out].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('cambia el orden según el azar', () => {
    expect(shuffle([1, 2, 3, 4, 5, 6], seeded(1))).not.toEqual(shuffle([1, 2, 3, 4, 5, 6], seeded(99)));
  });
  it('elige n sin repetir; si hay menos, devuelve todas', () => {
    const out = pickRandom([1, 2, 3, 4, 5], 3, seeded(3));
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
    expect(pickRandom([1, 2], 10)).toHaveLength(2);
    expect(pickRandom([1, 2], 0)).toEqual([]);
  });
  it('con muchas repeticiones reparte parejo (cada elemento sale ~igual)', () => {
    const rng = seeded(11); const hits = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) for (const x of pickRandom([0, 1, 2, 3], 2, rng)) hits[x]++;
    for (const h of hits) expect(h).toBeGreaterThan(1800), expect(h).toBeLessThan(2200);
  });
});
describe('availableQuestions / minLibraries', () => {
  const exams = [{ folder_id: 'a', question_count: 10 }, { folder_id: 'b', question_count: 5 }, { folder_id: null, question_count: 99 }, { folder_id: 'a', question_count: 3 }];
  it('suma solo las bibliotecas elegidas', () => {
    expect(availableQuestions(exams, new Set(['a']))).toBe(13);
    expect(availableQuestions(exams, new Set(['a', 'b']))).toBe(18);
    expect(availableQuestions(exams, new Set())).toBe(0);
  });
  it('pide 2 bibliotecas, o 1 si solo hay una', () => {
    expect([minLibraries(0), minLibraries(1), minLibraries(2), minLibraries(9)]).toEqual([1, 1, 2, 2]);
  });
});
