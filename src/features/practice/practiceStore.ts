import { create } from 'zustand';
import { Question, Response } from '@/lib/grading';
import { supabase, todayLocal } from '@/lib/supabase';
import { clearProgress, loadProgress, saveProgress, type SavedMode } from './progress';

export interface Result {
  questionId: string;
  response: Response;
  correct: boolean;
  timeMs: number;
}

export interface Summary {
  attemptId: string;
  total: number;
  correct: number;
  score: number;
  durationSec: number;
  xp: number;
  answersSaved: boolean; // false si falló el guardado del detalle de respuestas
}

// Id especial para la sesión de Repaso Rápido (mezcla preguntas de varios simulacros)
export const QUICK_REVIEW_ID = 'quick';

type Mode = SavedMode;

interface PracticeState {
  active: boolean;
  examId: string;
  mode: Mode;
  /** Sesión dentro del simulacro ('full', 'wrong', 'saved'…): decide dónde se guarda el avance para continuar. */
  slot: string;
  parentAttemptId?: string;
  allQuestions: Question[];
  queue: Question[];
  index: number;
  results: Result[];
  startedAt: number;
  questionStartedAt: number;
  summary: Summary | null;
  start(examId: string, questions: Question[], mode?: Mode, parent?: string, slot?: string): void;
  /** Continúa una sesión guardada. Devuelve false si no hay nada que continuar. */
  resume(examId: string, slot: string): Promise<boolean>;
  record(response: Response, correct: boolean): void;
  retryWrongQueue(): Question[];
  finish(): Promise<Summary>;
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
      savedAt: Date.now(),
    });
  };

  return {
    active: false,
    examId: '',
    mode: 'full',
    slot: 'full',
    allQuestions: [],
    queue: [],
    index: 0,
    results: [],
    startedAt: 0,
    questionStartedAt: 0,
    summary: null,

    start: (examId, questions, mode = 'full', parent, slot = mode) => {
      clearProgress(examId, slot); // empezar de nuevo descarta el avance viejo de esa sesión
      set((s) => ({
        active: true,
        examId,
        mode,
        slot,
        parentAttemptId: parent,
        // Al repetir solo las falladas se conserva la lista completa original
        allQuestions: mode === 'retry_wrong' || (mode === 'quick_review' && parent) ? s.allQuestions : questions,
        queue: questions,
        index: 0,
        results: [],
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
        allQuestions: allQuestions.length ? allQuestions : queue,
        queue,
        index: results.length, // cada respuesta avanza una pregunta: la siguiente es la que sigue
        results,
        summary: null,
        startedAt: Date.now() - saved.elapsedMs, // el tiempo fuera de la app no cuenta
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

    retryWrongQueue: () => {
      const { queue, results } = get();
      const wrong = new Set(results.filter((r) => !r.correct).map((r) => r.questionId));
      return queue.filter((q) => wrong.has(q.id));
    },

    finish: async () => {
      const s = get();
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user!.id;

      const total = s.results.length;
      const correct = s.results.filter((r) => r.correct).length;
      const score = total ? Math.round((correct / total) * 10000) / 100 : 0;
      const durationSec = Math.round((Date.now() - s.startedAt) / 1000);
      // Practicar preguntas sueltas ('custom') no da bono por completar, para no regalar XP
      const bonus = s.mode === 'custom' || s.mode === 'quick_review' ? 0 : 20 + (score >= 90 ? 30 : 0);
      const xp = correct * 10 + bonus;

      const { data: attempt, error } = await supabase
        .from('attempts')
        .insert({
          user_id: userId,
          exam_id: s.examId === QUICK_REVIEW_ID ? null : s.examId, // el Repaso Rápido no pertenece a un solo simulacro
          mode: s.mode,
          parent_attempt_id: s.parentAttemptId ?? null,
          started_at: new Date(s.startedAt).toISOString(),
          finished_at: new Date().toISOString(),
          duration_sec: durationSec,
          total,
          correct,
          score,
          xp_earned: xp,
        })
        .select('id')
        .single();
      if (error) throw error;

      // El intento ya quedó guardado: no hay nada que continuar
      clearProgress(s.examId, s.slot);

      const { error: answersError } = await supabase.from('attempt_answers').insert(
        s.results.map((r) => ({
          attempt_id: attempt.id,
          user_id: userId,
          question_id: r.questionId,
          response: r.response,
          is_correct: r.correct,
          time_ms: r.timeMs,
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
      };
      set({ summary });
      return summary;
    },

    // Salir NO borra el avance guardado: así puedes volver y continuar
    reset: () =>
      set({ active: false, queue: [], allQuestions: [], results: [], index: 0, summary: null, parentAttemptId: undefined }),
  };
});
