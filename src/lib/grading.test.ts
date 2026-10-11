import { describe, expect, it } from 'vitest';
import { checkAnswer, correctText, type Question } from './grading';

const ow: Question = {
  id: 'q', type: 'order_words', prompt: 'Ordena',
  options: [{ id: 'w1', text: 'lived' }, { id: 'w2', text: 'has' }, { id: 'w3', text: 'She' }, { id: 'w4', text: 'here' }],
  answer: { accepted: ['She has lived here.'] },
};
const tr: Question = { id: 't', type: 'transform', prompt: 'She has finished.', options: null, answer: { accepted: ['She has not finished.', "She hasn't finished."], form: 'negativa' } };

describe('order_words', () => {
  it('acepta la oración bien armada (sin importar mayúsculas ni punto)', () => {
    expect(checkAnswer(ow, { type: 'order_words', order: ['w3', 'w2', 'w1', 'w4'] })).toBe(true);
  });
  it('rechaza orden incorrecto o incompleto', () => {
    expect(checkAnswer(ow, { type: 'order_words', order: ['w2', 'w3', 'w1', 'w4'] })).toBe(false);
    expect(checkAnswer(ow, { type: 'order_words', order: ['w3', 'w2'] })).toBe(false);
  });
  it('muestra la oración correcta', () => {
    expect(correctText(ow)).toBe('She has lived here.');
  });
});

describe('transform (se contesta escribiendo)', () => {
  it('acepta cualquiera de las respuestas válidas', () => {
    expect(checkAnswer(tr, { type: 'short_answer', text: 'she has not finished' })).toBe(true);
    expect(checkAnswer(tr, { type: 'short_answer', text: "She hasn't finished." })).toBe(true);
    expect(checkAnswer(tr, { type: 'short_answer', text: 'She has finished.' })).toBe(false);
  });
  it('muestra la primera respuesta', () => {
    expect(correctText(tr)).toBe('She has not finished.');
  });
});
