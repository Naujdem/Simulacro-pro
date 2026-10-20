import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]> }));
vi.mock('@/lib/supabase', () => ({
  todayLocal: () => '2026-10-20',
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: async () => ({ error: null }),
    from: (table: string) => ({
      insert: (rows: unknown) => {
        (db.rows[table] ??= []).push(rows);
        return Object.assign(Promise.resolve({ error: null }), {
          select: () => ({ single: async () => ({ data: { id: 'att1' }, error: null }) }),
        });
      },
    }),
  },
}));

import { usePractice } from './practiceStore';
import { loadProgress, clearProgress } from './progress';
import type { Question } from '@/lib/grading';

const mk = (id: string, section: string): Question => ({
  id,
  type: 'true_false',
  prompt: id,
  options: null,
  answer: { value: true },
  section,
});
const ids = () => usePractice.getState().queue.map((q) => q.id).join(',');
const P = () => usePractice.getState();

// Sección A: a1 a2 a3 · Sección B: b1 b2
const preguntas = () => [mk('a1', 'A'), mk('a2', 'A'), mk('a3', 'A'), mk('b1', 'B'), mk('b2', 'B')];
const ok = { type: 'true_false', value: true } as const;

// El entorno de tests no trae localStorage: uno en memoria para comprobar el avance que se guarda
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  db.rows = {};
  usePractice.getState().reset();
  clearProgress('ex1', 'full');
});

describe('saltar en una sesión de práctica', () => {
  it('la pregunta saltada pasa al final de su sección y se marca como saltada', () => {
    P().start('ex1', preguntas(), 'full');
    expect(P().skipQuestion()).toBe(true);
    expect(ids()).toBe('a2,a3,a1,b1,b2');
    expect(P().index).toBe(0);
    expect(P().skippedIds).toEqual(['a1']);
  });

  it('al responder después de saltar, cada respuesta queda en su pregunta (results[i] ↔ queue[i])', () => {
    P().start('ex1', preguntas(), 'full');
    P().skipQuestion(); // a2,a3,a1 | b1,b2
    P().record(ok, true); // a2
    P().record(ok, false); // a3
    P().record(ok, true); // a1 (la saltada)
    const { queue, results } = P();
    expect(results.map((r) => r.questionId)).toEqual(queue.slice(0, 3).map((q) => q.id));
    expect(results.map((r) => r.questionId)).toEqual(['a2', 'a3', 'a1']);
    expect(P().index).toBe(3);
  });

  it('el avance guardado sigue siendo válido y se puede continuar con el nuevo orden', () => {
    P().start('ex1', preguntas(), 'full');
    P().skipQuestion();
    P().record(ok, true);
    const guardado = loadProgress('ex1', 'full');
    expect(guardado).not.toBeNull(); // isValid exige results[i].questionId === questionIds[i]
    expect(guardado!.questionIds).toEqual(['a2', 'a3', 'a1', 'b1', 'b2']);
    expect(guardado!.results).toHaveLength(1);
  });

  it('saltar también guarda el orden nuevo si ya había respuestas', () => {
    P().start('ex1', preguntas(), 'full');
    P().record(ok, true); // a1
    P().skipQuestion(); // a2 → final de A
    expect(loadProgress('ex1', 'full')!.questionIds).toEqual(['a1', 'a3', 'a2', 'b1', 'b2']);
  });

  it('no deja saltar la última pregunta de la sección: devuelve false y no cambia nada', () => {
    P().start('ex1', preguntas(), 'full');
    P().record(ok, true);
    P().record(ok, true); // queda solo a3
    const antes = ids();
    expect(P().skipQuestion()).toBe(false);
    expect(ids()).toBe(antes);
    expect(P().skippedIds).toEqual([]);
  });

  it('dejar en blanco cuenta como incorrecta, avanza, y queda marcada como dejada por el usuario', () => {
    P().start('ex1', preguntas(), 'full');
    P().leaveUnanswered();
    const r = P().results[0];
    expect(r).toMatchObject({ questionId: 'a1', correct: false, skipped: true, skipReason: 'user', response: { type: 'skipped' } });
    expect(P().index).toBe(1);
  });

  it('en un repaso (no "full") saltar manda la pregunta al final de toda la cola', () => {
    P().start('ex1', preguntas(), 'custom', undefined, 'full');
    P().skipQuestion();
    expect(ids()).toBe('a2,a3,b1,b2,a1');
  });

  it('al terminar, lo dejado en blanco se guarda como incorrecto, sin tiempo, y no se pierde ninguna pregunta', async () => {
    P().start('ex1', [mk('a1', 'A'), mk('a2', 'A'), mk('a3', 'A')], 'full');
    P().skipQuestion(); // a2,a3,a1
    P().record(ok, true); // a2 ✔
    P().record(ok, true); // a3 ✔
    P().leaveUnanswered(); // a1 en blanco
    const resumen = await P().finish();
    expect(resumen).toMatchObject({ total: 3, correct: 2, unanswered: 0 });
    const filas = db.rows['attempt_answers'][0] as { question_id: string; is_correct: boolean; time_ms: number | null; response: { type: string } }[];
    expect(filas.map((f) => f.question_id).sort()).toEqual(['a1', 'a2', 'a3']);
    const blanco = filas.find((f) => f.question_id === 'a1')!;
    expect(blanco).toMatchObject({ is_correct: false, time_ms: null, response: { type: 'skipped' } });
  });

  it('las dejadas en blanco entran en "repetir las falladas"', () => {
    P().start('ex1', preguntas(), 'full');
    P().leaveUnanswered(); // a1
    P().record(ok, true); // a2
    P().record(ok, false); // a3
    expect(P().retryWrongQueue().map((q) => q.id)).toEqual(['a1', 'a3']);
  });

  it('empezar de nuevo olvida lo saltado', () => {
    P().start('ex1', preguntas(), 'full');
    P().skipQuestion();
    P().start('ex1', preguntas(), 'full');
    expect(P().skippedIds).toEqual([]);
    expect(ids()).toBe('a1,a2,a3,b1,b2');
  });

  it('con tiempo límite, lo que sigue sin responder (incluidas las saltadas) cuenta como incorrecto', async () => {
    P().start('ex1', [mk('a1', 'A'), mk('a2', 'A'), mk('a3', 'A')], 'full', undefined, 'full', 600);
    P().skipQuestion(); // a2,a3,a1
    P().record(ok, true); // a2
    const resumen = await P().finish({ timedOut: true });
    expect(resumen).toMatchObject({ total: 3, correct: 1, unanswered: 2, timedOut: true });
    const filas = db.rows['attempt_answers'][0] as { question_id: string }[];
    expect(filas.map((f) => f.question_id).sort()).toEqual(['a1', 'a2', 'a3']);
  });
});
