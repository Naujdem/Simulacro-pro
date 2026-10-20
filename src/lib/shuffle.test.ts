import { describe, expect, it } from 'vitest';
import { canShuffle, letterOf, remapLetters, shuffleQuestion } from './shuffle';
import { checkAnswer, correctText, type Question } from './grading';

const mc = (over: Partial<Question> = {}): Question => ({
  id: 'q1',
  type: 'multiple_choice',
  prompt: '¿Capital de Francia?',
  options: [
    { id: 'a', text: 'Madrid' },
    { id: 'b', text: 'París' },
    { id: 'c', text: 'Roma' },
    { id: 'd', text: 'Lisboa' },
  ],
  answer: { correct: ['b'] },
  ...over,
});

describe('mezclar opciones', () => {
  it('con la misma semilla sale el mismo orden; con otras, el orden cambia', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const a = shuffleQuestion(mc(), seed).options!.map((o) => o.id).join('');
      expect(shuffleQuestion(mc(), seed).options!.map((o) => o.id).join('')).toBe(a);
      orders.add(a);
    }
    expect(orders.size).toBeGreaterThan(5);
  });

  it('conserva las mismas opciones con sus ids y la respuesta correcta sigue siendo la misma', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const q = mc();
      const s = shuffleQuestion(q, seed);
      expect([...s.options!].sort((x, y) => x.id.localeCompare(y.id))).toEqual(q.options);
      expect(s.answer).toEqual({ correct: ['b'] });
      expect(checkAnswer(s, { type: 'multiple_choice', selected: ['b'] })).toBe(true);
      expect(checkAnswer(s, { type: 'multiple_choice', selected: ['a'] })).toBe(false);
      expect(correctText(s)).toBe('París');
    }
  });

  it('la correcta cambia de posición (ya no queda siempre en el mismo lugar)', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) positions.add(shuffleQuestion(mc(), seed).options!.findIndex((o) => o.id === 'b'));
    expect(positions).toEqual(new Set([0, 1, 2, 3]));
  });

  it('no modifica la pregunta original', () => {
    const q = mc();
    const copia = JSON.stringify(q);
    shuffleQuestion(q, 7);
    expect(JSON.stringify(q)).toBe(copia);
  });

  it('letterOf da la letra por posición', () => {
    expect([0, 1, 2, 3, 4].map(letterOf)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  describe('qué preguntas NO se mezclan', () => {
    const conOpciones = (...texts: string[]) => mc({ options: texts.map((text, i) => ({ id: 'abcdef'[i], text })) });
    it('otros tipos de pregunta', () => {
      expect(canShuffle({ ...mc(), type: 'true_false', options: null })).toBe(false);
      expect(shuffleQuestion({ ...mc(), type: 'order_words' }, 3).options).toEqual(mc().options);
    });
    it('"todas / ninguna de las anteriores", "A y B" y [IMAGEN A]', () => {
      expect(canShuffle(conOpciones('Uno', 'Dos', 'Todas las anteriores'))).toBe(false);
      expect(canShuffle(conOpciones('Uno', 'Dos', 'Ninguna de las anteriores'))).toBe(false);
      expect(canShuffle(conOpciones('Uno', 'Dos', 'Ambas son correctas, las anteriores'))).toBe(false);
      expect(canShuffle(conOpciones('Uno', 'Dos', 'A y B'))).toBe(false);
      expect(canShuffle(conOpciones('[IMAGEN A]', '[IMAGEN B]', '[IMAGEN C]'))).toBe(false);
      expect(canShuffle(conOpciones('Uno', 'La opción A y la B'))).toBe(false);
    });
    it('opciones normales sí, aunque digan "todas" o usen números romanos', () => {
      expect(canShuffle(conOpciones('Todas las plantas hacen fotosíntesis', 'Solo las verdes'))).toBe(true);
      expect(canShuffle(conOpciones('I y II', 'Solo III', 'II y III'))).toBe(true);
    });
    it('explicaciones con letras que no se pueden reescribir con seguridad', () => {
      expect(canShuffle(mc({ explanation: 'Respuesta correcta: B' }))).toBe(false);
      expect(canShuffle(mc({ explanation: 'La opción b es la correcta.' }))).toBe(false);
      expect(canShuffle(mc({ explanation: 'A) es falsa y B) es cierta.' }))).toBe(false);
    });
  });

  describe('las letras de la explicación siguen a las opciones', () => {
    it('remapLetters cambia "opción X" y listas "X y Y", sin tocar otras palabras', () => {
      const map = new Map([['A', 'C'], ['B', 'A'], ['C', 'D'], ['D', 'B']]);
      expect(remapLetters('La opción A es la más acertada. La opción B se centra en otra cosa.', map)).toBe(
        'La opción C es la más acertada. La opción A se centra en otra cosa.',
      );
      expect(remapLetters('Las opciones A y C, aunque válidas, no sirven. La opción D, Entonces…', map)).toBe(
        'Las opciones C y D, aunque válidas, no sirven. La opción B, Entonces…',
      );
      expect(remapLetters('A pesar de todo, la opción B y a continuación otra.', map)).toBe('A pesar de todo, la opción A y a continuación otra.');
    });
    it('la explicación mezclada nombra la letra donde quedó cada opción', () => {
      const q = mc({
        options: [
          { id: 'a', text: 'Madrid' },
          { id: 'b', text: 'París' },
          { id: 'c', text: 'Roma' },
        ],
        explanation: 'La opción B es correcta. La opción A y la opción C son otras capitales.',
      });
      for (let seed = 1; seed <= 25; seed++) {
        const s = shuffleQuestion(q, seed);
        const letra = (texto: string) => letterOf(s.options!.findIndex((o) => o.text === texto));
        expect(s.explanation).toBe(`La opción ${letra('París')} es correcta. La opción ${letra('Madrid')} y la opción ${letra('Roma')} son otras capitales.`);
      }
    });
  });
});
