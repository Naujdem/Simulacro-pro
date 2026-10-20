import { beforeEach, describe, expect, it, vi } from 'vitest';

const q = vi.hoisted(() => ({ result: { data: [{ id: 'q1' }], error: null } as { data: unknown; error: unknown }, patch: null as unknown, eqArgs: null as unknown }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (patch: unknown) => {
        q.patch = patch;
        return {
          eq: (...a: unknown[]) => {
            q.eqArgs = a;
            return { select: async () => q.result };
          },
        };
      },
    }),
  },
  todayLocal: () => '2026-10-20',
}));

import { updateQuestion, type EditableQuestion } from './api';

const edit: EditableQuestion = {
  id: 'q1',
  type: 'multiple_choice',
  prompt: '  ¿Capital?  ',
  options: [{ id: 'a', text: 'Madrid' }, { id: 'b', text: 'París' }],
  answer: { correct: ['b'] },
  explanation: '  ',
  imagen_url: '',
};

beforeEach(() => {
  q.result = { data: [{ id: 'q1' }], error: null };
  q.patch = null;
});

describe('updateQuestion (guardar UNA pregunta)', () => {
  it('actualiza solo los campos editables de esa pregunta, ya limpios', async () => {
    await updateQuestion(edit);
    expect(q.eqArgs).toEqual(['id', 'q1']);
    expect(q.patch).toEqual({ prompt: '¿Capital?', options: edit.options, answer: { correct: ['b'] }, explanation: null, imagen_url: null });
  });
  it('si no cambió ninguna fila (sin permiso), falla con un mensaje claro en vez de fingir que guardó', async () => {
    q.result = { data: [], error: null };
    await expect(updateQuestion(edit)).rejects.toThrow(/No tienes permiso/);
  });
  it('propaga el error de la base de datos', async () => {
    q.result = { data: null, error: new Error('red caída') };
    await expect(updateQuestion(edit)).rejects.toThrow('red caída');
  });
  it('rechaza una pregunta sin id', async () => {
    await expect(updateQuestion({ ...edit, id: null })).rejects.toThrow(/identificador/);
  });
});
