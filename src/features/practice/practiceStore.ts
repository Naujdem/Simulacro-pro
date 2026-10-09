import { create } from 'zustand';
import { Question, Response } from '@/lib/grading';
import { supabase, todayLocal } from '@/lib/supabase';

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

type Mode = 'full' | 'retry_wrong' | 'custom';

interface PracticeState {
  active: boolean;
  examId: string;
  mode: Mode;
  parentAttemptId?: string;
  allQuestions: Question[];
  queue: Question[];
  index: number;
  results: Result[];
  startedAt: number;
  questionStartedAt: number;
  summary: Summary | null;
  start(examId: string, questions: Question[], mode?: Mode, parent?: string): void;
  record(response: Response, correct: boolean): void;
  retryWrongQueue(): Question[];
  finish(): Promise<Summary>;
  reset(): void;
}

export const usePractice = create<PracticeState>((set, get) => ({
  active: false,
  examId: '',
  mode: 'full',
  allQuestions: [],
  queue: [],
  index: 0,
  results: [],
  startedAt: 0,
  questionStartedAt: 0,
  summary: null,

  start: (examId, questions, mode = 'full', parent) =>
    set((s) => ({
      active: true,
      examId,
      mode,
      parentAttemptId: parent,
      allQuestions: mode === 'retry_wrong' ? s.allQuestions : questions,
      queue: questions,
      index: 0,
      results: [],
      summary: null,
      startedAt: Date.now(),
      questionStartedAt: Date.now(),
    })),

  record: (response, correct) =>
    set((s) => ({
      results: [
        ...s.results,
        { questionId: s.queue[s.index].id, response, correct, timeMs: Date.now() - s.questionStartedAt },
      ],
      index: s.index + 1,
      questionStartedAt: Date.now(),
    })),

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
    const bonus = s.mode === 'custom' ? 0 : 20 + (score >= 90 ? 30 : 0);
    const xp = correct * 10 + bonus;

    const { data: attempt, error } = await supabase
      .from('attempts')
      .insert({
        user_id: userId,
        exam_id: s.examId,
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

  reset: () =>
    set({ active: false, queue: [], allQuestions: [], results: [], index: 0, summary: null, parentAttemptId: undefined }),
}));
