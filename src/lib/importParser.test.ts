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

  it('Explicación opcional: opción múltiple (formato 1)', () => {
    const r = parseQuestions(`1. ¿Cuál es la capital de Francia?
A) Madrid
B) París
C) Roma
D) Berlín
Respuesta: B
Explicación: París es una ciudad francesa

2. ¿Cuál es la capital de Italia?
A) Madrid
B) París
C) Roma
D) Berlín
Respuesta: C`);
    expect(r).toHaveLength(2);
    expect(r[0].options).toHaveLength(4);
    expect(r[0].answer).toEqual({ correct: ['b'] });
    expect(r[0].explanation).toBe('París es una ciudad francesa');
    expect(r[0].confidence).toBe(1);
    // sin explicación no pasa nada
    expect(r[1].explanation).toBeUndefined();
    expect(r[1].confidence).toBe(1);
  });

  it('Explicación opcional: verdadero/falso', () => {
    const r = parseQuestions(`2. Las plantas absorben dióxido de carbono.
Verdadero
Explicación: Lo usan en la fotosíntesis.`);
    expect(r[0].type).toBe('true_false');
    expect(r[0].answer).toEqual({ value: true });
    expect(r[0].explanation).toBe('Lo usan en la fotosíntesis.');
  });

  it('Explicación opcional: formato Pregunta / Opciones / Correcta', () => {
    const r = parseQuestions(`Pregunta: ¿Cuál es la capital de Italia?
Opciones: Madrid | París | Roma | Berlín
Correcta: Roma
Explicación: Roma es la capital desde 1871.`);
    expect(r[0].type).toBe('multiple_choice');
    expect(r[0].answer).toEqual({ correct: ['c'] });
    expect(r[0].explanation).toBe('Roma es la capital desde 1871.');
  });

  it('la explicación puede ocupar varias líneas sin confundirse con opciones', () => {
    const r = parseQuestions(`1. ¿Cuál es la capital de Francia?
A) Madrid
B) París
Respuesta: B
Explicación: París es la capital.
A. diferencia de Madrid, está en Francia.`);
    expect(r[0].options).toHaveLength(2);
    expect(r[0].explanation).toBe('París es la capital. A. diferencia de Madrid, está en Francia.');
  });

  it('Explicación con el texto en la línea de abajo', () => {
    const r = parseQuestions(`1. ¿Capital de Francia?
A) Madrid
B) París
Respuesta: B
Explicación:
París es la capital de Francia.
Es la sede del gobierno.`);
    expect(r).toHaveLength(1);
    expect(r[0].answer).toEqual({ correct: ['b'] });
    expect(r[0].confidence).toBe(1);
    expect(r[0].explanation).toBe('París es la capital de Francia. Es la sede del gobierno.');
  });

  it('una lista numerada dentro de la explicación no crea preguntas nuevas', () => {
    const r = parseQuestions(`1. ¿Capital de Francia?
A) Madrid
B) París
Respuesta: B
Explicación: Hay dos razones:
1. Es la sede del gobierno.
2. Es la ciudad más grande.`);
    expect(r).toHaveLength(1);
    expect(r[0].answer).toEqual({ correct: ['b'] });
    expect(r[0].explanation).toBe('Hay dos razones: 1. Es la sede del gobierno. 2. Es la ciudad más grande.');
  });

  it('tras una explicación con lista, la pregunta siguiente sí se separa', () => {
    const r = parseQuestions(`1. ¿Capital de Francia?
A) Madrid
B) París
Respuesta: B
Explicación: Hay dos razones:
1. Es la sede del gobierno.
2. Es la ciudad más grande.

2. ¿Capital de Italia?
A) Roma
B) Lisboa
Respuesta: A

3. Las plantas absorben CO2.
Verdadero
Explicación: Lo usan al hacer fotosíntesis.

Pregunta: La capital de Perú es ___.
Respuesta: Lima`);
    expect(r).toHaveLength(4);
    expect(r[0].explanation).toContain('2. Es la ciudad más grande.');
    expect(r[1].answer).toEqual({ correct: ['a'] });
    expect(r[1].explanation).toBeUndefined();
    expect(r[2].type).toBe('true_false');
    expect(r[2].explanation).toBe('Lo usan al hacer fotosíntesis.');
    expect(r[3].type).toBe('fill_blank');
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
