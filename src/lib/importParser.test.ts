import { describe, expect, it } from 'vitest';
import { parseQuestions } from './importParser';
import { checkAnswer } from './grading';

describe('parseQuestions', () => {
  it('Formato 1: opción múltiple + V/F', () => {
    const r = parseQuestions(`1. ¿Cuál es la capital de Francia?
A) Madrid
B) París
C) Roma
D) Berlín
Respuesta: B

2. Las plantas absorben dióxido de carbono.
Verdadero`);
    expect(r).toHaveLength(2);
    expect(r[0].type).toBe('multiple_choice');
    expect(r[0].options).toHaveLength(4);
    expect(r[0].answer).toEqual({ correct: ['b'] });
    expect(r[0].confidence).toBe(1);
    expect(r[1].type).toBe('true_false');
    expect(r[1].answer).toEqual({ value: true });
  });

  it('Formato 2: Pregunta / Opciones / Correcta', () => {
    const r = parseQuestions(`Pregunta: ¿Cuál es la capital de Francia?
Opciones: Madrid | París | Roma | Berlín
Correcta: París`);
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('multiple_choice');
    expect(r[0].answer).toEqual({ correct: ['b'] });
  });

  it('completar espacios con alternativas', () => {
    const r = parseQuestions(`1. La capital de Francia es ___.
Respuesta: París/Paris`);
    expect(r[0].type).toBe('fill_blank');
    expect(r[0].prompt).toContain('{{1}}');
    expect(r[0].answer).toEqual({ blanks: [['París', 'Paris']] });
  });

  it('respuesta corta y explicación', () => {
    const r = parseQuestions(`1. ¿Cómo se llama el proceso por el que las plantas producen glucosa?
Respuesta: fotosíntesis
Explicación: Usa luz solar, agua y CO2.`);
    expect(r[0].type).toBe('short_answer');
    expect(r[0].answer).toEqual({ accepted: ['fotosíntesis'] });
    expect(r[0].explanation).toMatch(/luz solar/);
  });

  it('multi-selección', () => {
    const r = parseQuestions(`1. Son planetas:
A) Marte
B) Luna
C) Venus
Respuesta: A, C`);
    expect(r[0].answer).toEqual({ correct: ['a', 'c'] });
  });

  it('marca baja confianza si falta la respuesta', () => {
    const r = parseQuestions(`1. ¿Capital de Francia?
A) Madrid
B) París`);
    expect(r[0].confidence).toBeLessThan(0.6);
    expect(r[0].warnings.length).toBeGreaterThan(0);
  });

  it('ignora números de página', () => {
    const r = parseQuestions(`1. Pregunta uno?
A) x
B) y
Respuesta: A
Página 2
2. Pregunta dos?
A) x
B) y
Respuesta: B`);
    expect(r).toHaveLength(2);
  });
});

describe('checkAnswer', () => {
  it('tolera tildes, mayúsculas y un error de tipeo', () => {
    const q = { id: '1', type: 'short_answer' as const, prompt: '', options: null, answer: { accepted: ['fotosíntesis'] } };
    expect(checkAnswer(q, { type: 'short_answer', text: 'Fotosintesis' })).toBe(true);
    expect(checkAnswer(q, { type: 'short_answer', text: 'fotosintesys' })).toBe(true);
    expect(checkAnswer(q, { type: 'short_answer', text: 'respiración' })).toBe(false);
  });

  it('multiple_choice exige el conjunto exacto', () => {
    const q = { id: '1', type: 'multiple_choice' as const, prompt: '', options: [], answer: { correct: ['a', 'c'] } };
    expect(checkAnswer(q, { type: 'multiple_choice', selected: ['c', 'a'] })).toBe(true);
    expect(checkAnswer(q, { type: 'multiple_choice', selected: ['a'] })).toBe(false);
  });
});
