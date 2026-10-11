import { describe, expect, it } from 'vitest';
import { accuracyByLibrary, lastAttempts, mostFailed, rangeStart, trend, type AnswerRow } from './statsLogic';

const row = (q: string | null, ok: boolean, folder: string | null = 'f1', prompt = 'P' + q): AnswerRow => ({
  question_id: q, is_correct: ok, questions: q ? { prompt, exams: { title: 'Ex', folder_id: folder } } : null,
});

describe('accuracyByLibrary', () => {
  const folders = [{ id: 'f1', name: 'Química' }, { id: 'f2', name: 'Inglés' }];
  it('agrupa por biblioteca y calcula el %', () => {
    const r = accuracyByLibrary([row('a', true), row('b', false), row('c', true), row('d', true, 'f2')], folders);
    expect(r).toEqual([
      { name: 'Química', answered: 3, correct: 2, pct: 67 },
      { name: 'Inglés', answered: 1, correct: 1, pct: 100 },
    ]);
  });
  it('los simulacros sin carpeta van a "Sin biblioteca"', () => {
    expect(accuracyByLibrary([row('a', false, null)], folders)[0]).toMatchObject({ name: 'Sin biblioteca', pct: 0 });
  });
  it('sin datos devuelve lista vacía', () => expect(accuracyByLibrary([], folders)).toEqual([]));
});

describe('mostFailed', () => {
  it('ordena por fallos, ignora las nunca falladas y las preguntas borradas, y limita', () => {
    const rows = [row('a', false), row('a', false), row('a', true), row('b', false), row('c', true), row(null, false)];
    const r = mostFailed(rows, 10);
    expect(r.map((x) => [x.questionId, x.wrong, x.answered])).toEqual([['a', 2, 3], ['b', 1, 1]]);
    expect(mostFailed(rows, 1)).toHaveLength(1);
  });
  it('a igual número de fallos, primero la de peor proporción', () => {
    const rows = [row('a', false), row('a', true), row('a', true), row('b', false), row('b', true)];
    expect(mostFailed(rows).map((x) => x.questionId)).toEqual(['b', 'a']);
  });
});

describe('lastAttempts / trend', () => {
  const at = (i: number, score: number) => ({ id: 'i' + i, score, finished_at: `2026-10-${String(i).padStart(2, '0')}T10:00:00Z`, total: 5, exams: { title: 'T' + i } });
  it('toma los 10 más recientes en orden cronológico', () => {
    const rows = Array.from({ length: 12 }, (_, i) => at(i + 1, i * 5));
    const r = lastAttempts(rows);
    expect(r).toHaveLength(10);
    expect(r[0].id).toBe('i3');
    expect(r[9].id).toBe('i12');
  });
  it('descarta intentos sin terminar o vacíos', () => {
    expect(lastAttempts([{ ...at(1, 50), finished_at: null }, { ...at(2, 50), total: 0 }])).toEqual([]);
  });
  it('trend compara el último con el promedio anterior', () => {
    const p = lastAttempts([at(1, 40), at(2, 60), at(3, 80)]);
    expect(trend(p)).toBe(30);
    expect(trend(p.slice(0, 1))).toBeNull();
  });
});

describe('rangeStart', () => {
  it('calcula la fecha de inicio', () => {
    const now = new Date('2026-10-31T12:00:00Z');
    expect(rangeStart('all', now)).toBeNull();
    expect(rangeStart('7d', now)).toBe('2026-10-24T12:00:00.000Z');
    expect(rangeStart('30d', now)).toBe('2026-10-01T12:00:00.000Z');
  });
});
