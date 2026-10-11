import { describe, expect, it } from 'vitest';
import { planSync, type RemoteRow } from './progressSync';
import type { SavedProgress } from './progress';

const p = (examId: string, slot: string, savedAt: number): SavedProgress => ({
  v: 1,
  examId,
  slot,
  mode: 'full',
  questionIds: ['a', 'b', 'c'],
  allIds: ['a', 'b', 'c'],
  results: [],
  elapsedMs: 0,
  savedAt,
});
const row = (examId: string, slot: string, savedAt: number, data: SavedProgress | null = p(examId, slot, savedAt)): RemoteRow => ({
  exam_id: examId,
  slot,
  saved_at: savedAt,
  data,
});

describe('planSync (continuar en otro dispositivo)', () => {
  it('trae de la nube un avance que este dispositivo no tiene', () => {
    expect(planSync([], [row('e1', 'full', 100)])).toEqual([{ kind: 'pull', p: p('e1', 'full', 100) }]);
  });

  it('sube lo local cuando la nube no lo tiene o está más viejo', () => {
    expect(planSync([p('e1', 'full', 100)], [])).toEqual([{ kind: 'push', p: p('e1', 'full', 100) }]);
    expect(planSync([p('e1', 'full', 200)], [row('e1', 'full', 100)])).toEqual([{ kind: 'push', p: p('e1', 'full', 200) }]);
  });

  it('gana el más reciente cuando hay dos versiones', () => {
    expect(planSync([p('e1', 'full', 100)], [row('e1', 'full', 200)])).toEqual([{ kind: 'pull', p: p('e1', 'full', 200) }]);
  });

  it('si ya es igual no hace nada', () => {
    expect(planSync([p('e1', 'full', 100)], [row('e1', 'full', 100)])).toEqual([]);
  });

  it('una sesión terminada en otro dispositivo (data null más nueva) se descarta aquí', () => {
    expect(planSync([p('e1', 'full', 100)], [row('e1', 'full', 200, null)])).toEqual([
      { kind: 'drop', examId: 'e1', slot: 'full' },
    ]);
  });

  it('una sesión terminada hace tiempo no borra un avance local más nuevo', () => {
    expect(planSync([p('e1', 'full', 300)], [row('e1', 'full', 200, null)])).toEqual([{ kind: 'push', p: p('e1', 'full', 300) }]);
  });

  it('un borrado en la nube sin copia local no hace nada', () => {
    expect(planSync([], [row('e1', 'full', 200, null)])).toEqual([]);
  });

  it('sesiones distintas del mismo simulacro no se pisan', () => {
    const acts = planSync([p('e1', 'full', 100)], [row('e1', 'wrong', 50)]);
    expect(acts).toEqual([
      { kind: 'push', p: p('e1', 'full', 100) },
      { kind: 'pull', p: p('e1', 'wrong', 50) },
    ]);
  });
});
