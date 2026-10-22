import { create } from 'zustand';
import { Question, Response } from '@/lib/grading';
import { supabase, todayLocal } from '@/lib/supabase';
import { clearProgress, loadProgress, saveProgress, type SavedMode } from './progress';
import { groupBySection } from '@/lib/sections';
import { moveToEndOfScope } from './skip';

export interface Result {
  questionId: string;
  response: Response;
  correct: boolean;
  timeMs: number;
  /** Sin responder (por tiempo o porque se dejó en blanco). Cuenta como incorrecta. */
  skipped?: boolean;
  /** Por qué quedó sin responder: se acabó el tiempo o la dejaste en blanco. Si falta, fue por el tiempo. */
  skipReason?: 'time' | 'user';
}

export interface Summary {
  attemptId: string;
  total: number;
  correct: number;
  score: number;
  durationSec: number;
  xp: number;
  answersSaved: boolean; // false si falló el guardado del detalle de respuestas
  /** Preguntas que tenía la sesión; si es mayor que `total`, el resultado es parcial (terminaste en una pausa). */
  planned: number;
  /** Límite del Examen Cronometrado en segundos (null = sin límite). */
  limitSec: number | null;
  /** Se acabó el tiempo: las preguntas sin responder cuentan como incorrectas. */
  timedOut: boolean;
  unanswered: number;
}

// Id especial para la sesión de Repaso Rápido (mezcla preguntas de varios simulacros)
export const QUICK_REVIEW_ID = 'quick';
// Id especial para el Simulacro Sorpresa (preguntas al azar de varias bibliotecas, sin simulacro propio)
export const SURPRISE_ID = 'surprise';
// Id especial para el Super simulacro (varios simulacros completos seguidos con un solo cronómetro)
export const SUPER_ID = 'super';
/** Sesiones que mezclan preguntas de varios simulacros: no tienen simulacro propio. */
export const isMixedSession = (id: string) => id === QUICK_REVIEW_ID || id === SURPRISE_ID || id === SUPER_ID;

type Mode = SavedMode;

interface PracticeState {
  active: boolean;
  examId: string;
  mode: Mode;
  /** Sesión dentro del simulacro ('full', 'wrong', 'saved'…): decide dónde se guarda el avance para continuar. */
  slot: string;
  parentAttemptId?: string;
  /** Tiempo límite en segundos (Examen Cronometrado); null = sin límite. */
  limitSec: number | null;
  allQuestions: Question[];
  queue: Question[];
  index: number;
  results: Result[];
  /** Índice de la pausa entre secciones que ya se aceptó con "Continuar" (-1 = ninguna). */
  ack: number;
  /** Preguntas que saltaste en esta sesión (para avisar cuando vuelven a aparecer). */
  skippedIds: string[];
  startedAt: number;
  questionStartedAt: number;
  summary: Summary | null;
  start(examId: string, questions: Question[], mode?: Mode, parent?: string, slot?: string, limitSec?: number | null): void;
  /** Continúa una sesión guardada. Devuelve false si no hay nada que continuar. */
  resume(examId: string, slot: string): Promise<boolean>;
  record(response: Response, correct: boolean): void;
  /** "Continuar" en la pausa entre secciones. */
  continueSection(): void;
  /** Manda la pregunta actual al final de su sección (o de la cola) para verla después. Devuelve false si no queda otra por responder. */
  skipQuestion(): boolean;
  /** Deja la pregunta actual en blanco: cuenta como incorrecta y se sigue con la siguiente. */
  leaveUnanswered(): void;
  /** Cambia en la sesión una pregunta que se acaba de editar (misma posición, mismo id). */
  replaceQuestion(q: Question): void;
  retryWrongQueue(): Question[];
  /** Guarda el intento. Con `timedOut`, las preguntas sin responder se guardan como incorrectas. */
  finish(opts?: { timedOut?: boolean }): Promise<Summary>;
  reset(): void;
}

// Lee las preguntas por id (en tandas) respetando RLS; las que ya no existan simplemente no vuelven.
async function fetchQuestionsByIds(ids: string[]): Promise<Map<string, Question>> {
  const map = new Map<string, Question>();
  for (let i = 0; i < ids.length; i += 80) {
    const { data, error } = await supabase.from('questions').select('*').in('id', ids.slice(i, i + 80));
    if (error) throw error;
    for (const q of (data ?? []) as Question[]) map.set(q.id, q);
  }
  return map;
}

export const usePractice = create<PracticeState>((set, get) => {
  // Guarda el avance en el dispositivo después de cada respuesta
  const persist = () => {
    const s = get();
    if (!s.active || s.queue.length < 2 || !s.results.length) return; // una sola pregunta no necesita continuarse
    saveProgress({
      v: 1,
      examId: s.examId,
      slot: s.slot,
      mode: s.mode,
      parentAttemptId: s.parentAttemptId,
      questionIds: s.queue.map((q) => q.id),
      allIds: s.allQuestions.map((q) => q.id),
      results: s.results,
      elapsedMs: Date.now() - s.startedAt,
      ...(s.limitSec ? { limitSec: s.limitSec, startedAt: s.startedAt } : {}),
      savedAt: Date.now(),
    });
  };

  return {
    active: false,
    examId: '',
    mode: 'full',
    slot: 'full',
    limitSec: null,
    allQuestions: [],
    queue: [],
    index: 0,
    results: [],
    ack: -1,
    skippedIds: [],
    startedAt: 0,
    questionStartedAt: 0,
    summary: null,

    start: (examId, questions, mode = 'full', parent, slot = mode, limitSec = null) => {
      clearProgress(examId, slot); // empezar de nuevo descarta el avance viejo de esa sesión
      // El simulacro completo se hace por secciones (cada una seguida); los repasos no
      if (mode === 'full') questions = groupBySection(questions);
      set((s) => ({
        active: true,
        examId,
        mode,
        slot,
        parentAttemptId: parent,
        limitSec,
        // Al repetir solo las falladas se conserva la lista completa original
        allQuestions: mode === 'retry_wrong' || ((mode === 'quick_review' || mode === 'surprise' || mode === 'super') && parent) ? s.allQuestions : questions,
        queue: questions,
        index: 0,
        results: [],
        ack: -1,
        skippedIds: [],
        summary: null,
        startedAt: Date.now(),
        questionStartedAt: Date.now(),
      }));
    },

    resume: async (examId, slot) => {
      const saved = loadProgress(examId, slot);
      if (!saved) return false;

      const byId = await fetchQuestionsByIds([...new Set([...saved.questionIds, ...saved.allIds])]);
      const queue = saved.questionIds.map((id) => byId.get(id)).filter((q): q is Question => !!q);
      if (!queue.length) {
        clearProgress(examId, slot);
        return false;
      }
      const alive = new Set(queue.map((q) => q.id));
      // Si borraste preguntas del simulacro mientras tanto, se descartan también sus respuestas
      const results = saved.results.filter((r) => alive.has(r.questionId));
      const allQuestions = saved.allIds.map((id) => byId.get(id)).filter((q): q is Question => !!q);

      set({
        active: true,
        examId,
        mode: saved.mode,
        slot,
        parentAttemptId: saved.parentAttemptId,
        limitSec: saved.limitSec ?? null,
        allQuestions: allQuestions.length ? allQuestions : queue,
        queue,
        index: results.length, // cada respuesta avanza una pregunta: la siguiente es la que sigue
        results,
        ack: -1, // si saliste en una pausa entre secciones, vuelves a ella
        skippedIds: [],
        summary: null,
        // El tiempo fuera de la app no cuenta, salvo en el Examen Cronometrado: ahí el reloj sigue corriendo
        startedAt: saved.limitSec && saved.startedAt ? saved.startedAt : Date.now() - saved.elapsedMs,
        questionStartedAt: Date.now(),
      });
      return true;
    },

    record: (response, correct) => {
      set((s) => ({
        results: [
          ...s.results,
          { questionId: s.queue[s.index].id, response, correct, timeMs: Date.now() - s.questionStartedAt },
        ],
        index: s.index + 1,
        questionStartedAt: Date.now(),
      }));
      persist();
    },

    continueSection: () => set((s) => ({ ack: s.index })),

    skipQuestion: () => {
      const s = get();
      const q = s.queue[s.index];
      if (!s.active || !q) return false;
      // En el simulacro completo se queda dentro de su sección; en los repasos va al final de la cola
      const queue = moveToEndOfScope(s.queue, s.index, s.mode === 'full');
      if (queue === s.queue) return false;
      set({ queue, skippedIds: s.skippedIds.includes(q.id) ? s.skippedIds : [...s.skippedIds, q.id], questionStartedAt: Date.now() });
      persist();
      return true;
    },

    replaceQuestion: (nq) =>
      set((s) => ({
        queue: s.queue.map((q) => (q.id === nq.id ? nq : q)),
        allQuestions: s.allQuestions.map((q) => (q.id === nq.id ? nq : q)),
      })),

    leaveUnanswered: () => {
      set((s) => ({
        results: [
          ...s.results,
          { questionId: s.queue[s.index].id, response: { type: 'skipped' }, correct: false, timeMs: Date.now() - s.questionStartedAt, skipped: true, skipReason: 'user' },
        ],
        index: s.index + 1,
        questionStartedAt: Date.now(),
      }));
      persist();
    },

    retryWrongQueue: () => {
      const { queue, results } = get();
      const wrong = new Set(results.filter((r) => !r.correct).map((r) => r.questionId));
      return queue.filter((q) => wrong.has(q.id));
    },

    finish: async (opts) => {
      const s = get();
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user!.id;

      // Se acabó el tiempo: lo que no se alcanzó a responder cuenta como incorrecto
      const timedOut = !!opts?.timedOut && !!s.limitSec;
      const skipped: Result[] = timedOut
        ? s.queue.slice(s.results.length).map((q) => ({ questionId: q.id, response: { type: 'skipped' }, correct: false, timeMs: 0, skipped: true, skipReason: 'time' }))
        : [];
      const all = [...s.results, ...skipped];

      const total = all.length;
      const correct = all.filter((r) => r.correct).length;
      const score = total ? Math.round((correct / total) * 10000) / 100 : 0;
      const elapsedSec = Math.round((Date.now() - s.startedAt) / 1000);
      const durationSec = timedOut ? Math.min(elapsedSec, s.limitSec!) : elapsedSec;
      // Terminar un simulacro a medias ("Terminar aquí") se guarda como práctica parcial ('custom'):
      // no cuenta para el "mejor %" ni da el bono por completarlo. Si se acabó el tiempo, el examen sí cuenta entero.
      const partial = s.mode === 'full' && total < s.queue.length;
      const mode: Mode = partial ? 'custom' : s.mode;
      // Practicar preguntas sueltas ('custom') o mezcladas no da bono por completar, para no regalar XP
      const bonus = mode === 'custom' || mode === 'quick_review' || mode === 'surprise' || mode === 'super' ? 0 : 20 + (score >= 90 ? 30 : 0);
      const xp = correct * 10 + bonus;

      const { data: attempt, error } = await supabase
        .from('attempts')
        .insert({
          user_id: userId,
          exam_id: isMixedSession(s.examId) ? null : s.examId, // el Repaso Rápido y el Sorpresa no pertenecen a un solo simulacro
          mode,
          parent_attempt_id: s.parentAttemptId ?? null,
          started_at: new Date(s.startedAt).toISOString(),
          finished_at: new Date().toISOString(),
          duration_sec: durationSec,
          total,
          correct,
          score,
          xp_earned: xp,
          time_limit_sec: s.limitSec,
        })
        .select('id')
        .single();
      if (error) throw error;

      // El intento ya quedó guardado: no hay nada que continuar
      clearProgress(s.examId, s.slot);

      const { error: answersError } = await supabase.from('attempt_answers').insert(
        all.map((r) => ({
          attempt_id: attempt.id,
          user_id: userId,
          question_id: r.questionId,
          response: r.response,
          is_correct: r.correct,
          time_ms: r.skipped ? null : r.timeMs,
        })),
      );
      if (answersError) console.error('No se pudo guardar el detalle de respuestas:', answersError);
      await supabase.rpc('record_study', { p_xp: xp, p_today: todayLocal() });

      const summary: Summary = {
        attemptId: attempt.id,
        total,
        correct,
        score,
        durationSec,
        xp,
        answersSaved: !answersError,
        planned: s.queue.length,
        limitSec: s.limitSec,
        timedOut,
        unanswered: skipped.length,
      };
      set({ summary, results: all });
      return summary;
    },

    // Salir NO borra el avance guardado: así puedes volver y continuar
    reset: () =>
      set({ active: false, queue: [], allQuestions: [], results: [], index: 0, ack: -1, skippedIds: [], summary: null, parentAttemptId: undefined, limitSec: null }),
  };
});
