import { describe, expect, it } from 'vitest';
import { applyEdit, reconcileResponse, toEditable } from './editSync';
import type { Question } from '@/lib/grading';

const mc: Question = {
  id: 'q1',
  exam_id: 'ex1',
  type: 'multiple_choice',
  prompt: 'P',
  options: [
    { id: 'a', text: 'uno' },
    { id: 'b', text: 'dos' },
    { id: 'c', text: 'tres' },
  ],
  answer: { correct: ['a'] },
  section: 'S1',
  reading_id: 'r1',
};

describe('editar una pregunta de la sesión', () => {
  it('toEditable y applyEdit conservan id, sección, lectura y simulacro de origen', () => {
    const e = { ...toEditable(mc), prompt: '  Nuevo  ', explanation: '  Porque sí ', answer: { correct: ['b'] } };
    const n = applyEdit(mc, e);
    expect(n).toMatchObject({ id: 'q1', exam_id: 'ex1', section: 'S1', reading_id: 'r1', prompt: 'Nuevo', explanation: 'Porque sí', answer: { correct: ['b'] } });
    expect(applyEdit(mc, { ...e, explanation: '   ' }).explanation).toBeNull();
  });

  it('reconcileResponse quita las opciones que ya no existen', () => {
    const n = { ...mc, options: mc.options!.filter((o) => o.id !== 'c') };
    expect(reconcileResponse({ type: 'multiple_choice', selected: ['b', 'c'] }, n)).toEqual({ type: 'multiple_choice', selected: ['b'] });
    expect(reconcileResponse({ type: 'multiple_choice', selected: ['b'] }, n)).toEqual({ type: 'multiple_choice', selected: ['b'] });
  });

  it('reconcileResponse ajusta los espacios de completar y las palabras de ordenar', () => {
    const fb = { ...mc, type: 'fill_blank' as const, prompt: 'A {{1}} B {{2}} C {{3}}', options: null };
    expect(reconcileResponse({ type: 'fill_blank', blanks: ['x', 'y'] }, fb)).toEqual({ type: 'fill_blank', blanks: ['x', 'y', ''] });
    expect(reconcileResponse({ type: 'fill_blank', blanks: ['x', 'y', 'z'] }, { ...fb, prompt: 'A {{1}}' })).toEqual({ type: 'fill_blank', blanks: ['x'] });
    const ow = { ...mc, type: 'order_words' as const, options: [{ id: 'w1', text: 'a' }, { id: 'w2', text: 'b' }] };
    expect(reconcileResponse({ type: 'order_words', order: ['w2', 'w9', 'w1'] }, ow)).toEqual({ type: 'order_words', order: ['w2', 'w1'] });
  });

  it('el resto de respuestas no cambia', () => {
    expect(reconcileResponse({ type: 'true_false', value: true }, mc)).toEqual({ type: 'true_false', value: true });
    expect(reconcileResponse({ type: 'short_answer', text: 'hola' }, mc)).toEqual({ type: 'short_answer', text: 'hola' });
  });
});
