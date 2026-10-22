import { describe, expect, it } from 'vitest';
import { capacityFor, pickBalanced, pickHardest, secPerQuestion } from './superSimulacro';

const ex = (id: string, question_count: number, difficulty: number | null = null) => ({ id, question_count, difficulty });

describe('capacityFor / secPerQuestion', () => {
  it('calcula cuántas preguntas caben', () => {
    expect(capacityFor(60)).toBe(60);
    expect(capacityFor(30, 45)).toBe(40);
    expect(capacityFor(0)).toBe(1);
  });
  it('calcula los segundos por pregunta', () => {
    expect(secPerQuestion(60, 120)).toBe(30);
    expect(secPerQuestion(60, 0)).toBeNull();
  });
});

describe('pickHardest', () => {
  it('toma primero los de más estrellas y se detiene al llenar el tiempo', () => {
    const exams = [ex('a', 30, 2), ex('b', 30, 5), ex('c', 30, 4), ex('d', 30, 1)];
    expect(pickHardest(exams, 60)).toEqual(['b', 'c']);
  });
  it('ignora los sin calificar', () => {
    expect(pickHardest([ex('a', 10), ex('b', 10, 3)], 100)).toEqual(['b']);
  });
  it('salta los que no caben pero sigue con los más chicos', () => {
    expect(pickHardest([ex('a', 50, 5), ex('b', 40, 4), ex('c', 10, 3)], 60)).toEqual(['a', 'c']);
  });
  it('si ninguno cabe, toma el más difícil', () => {
    expect(pickHardest([ex('a', 100, 4), ex('b', 100, 5)], 10)).toEqual(['b']);
  });
  it('sin calificados no devuelve nada', () => {
    expect(pickHardest([ex('a', 10)], 100)).toEqual([]);
  });
});

describe('pickBalanced', () => {
  it('reparte por turnos entre niveles (3, 2, 4, 1, 5…)', () => {
    const exams = [ex('f1', 10, 1), ex('f2', 10, 2), ex('m3', 10, 3), ex('d4', 10, 4), ex('d5', 10, 5), ex('m3b', 10, 3)];
    expect(pickBalanced(exams, 1000)).toEqual(['m3', 'f2', 'd4', 'f1', 'd5', 'm3b']);
  });
  it('mezcla niveles aunque haya muchos de uno solo', () => {
    const exams = [ex('a', 10, 5), ex('b', 10, 5), ex('c', 10, 5), ex('d', 10, 1), ex('e', 10, 3)];
    const got = pickBalanced(exams, 30);
    expect(got).toEqual(['e', 'd', 'a']);
  });
  it('ignora los sin calificar y los vacíos', () => {
    expect(pickBalanced([ex('a', 10), ex('b', 0, 3), ex('c', 10, 3)], 100)).toEqual(['c']);
  });
});
