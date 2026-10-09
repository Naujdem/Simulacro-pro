import { supabase } from '@/lib/supabase';
import type { QType } from '@/lib/importParser';
import type { Question } from '@/lib/grading';

export interface Exam {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  question_count: number;
  folder_id: string | null;
  created_at: string;
}

export interface Folder {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export const FOLDER_COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#ec4899'];

export interface Profile {
  display_name: string | null;
  xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
}

export const fetchExams = async (): Promise<Exam[]> => {
  const { data, error } = await supabase.from('exams').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as Exam[];
};

export const fetchProfile = async (): Promise<Profile> => {
  const { data, error } = await supabase.from('profiles').select('*').single();
  if (error) throw error;
  return data as Profile;
};

export const fetchBestScores = async (): Promise<Record<string, number>> => {
  // Solo cuentan los intentos completos: repetir falladas o practicar una sola pregunta no debe inflar el "mejor %"
  const { data } = await supabase
    .from('attempts')
    .select('exam_id,score')
    .eq('mode', 'full')
    .not('finished_at', 'is', null);
  const best: Record<string, number> = {};
  for (const a of data ?? []) best[a.exam_id] = Math.max(best[a.exam_id] ?? 0, Number(a.score));
  return best;
};

export const fetchFolders = async (): Promise<Folder[]> => {
  const { data, error } = await supabase.from('folders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as Folder[];
};

export const fetchFolder = async (id: string): Promise<Folder> => {
  const { data, error } = await supabase.from('folders').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Folder;
};

export const createFolder = async (name: string, color: string): Promise<Folder> => {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('folders')
    .insert({ user_id: u.user!.id, name: name.trim(), color })
    .select('*')
    .single();
  if (error) throw error;
  return data as Folder;
};

export const assignExamToFolder = async (examId: string, folderId: string | null): Promise<void> => {
  const { error } = await supabase.from('exams').update({ folder_id: folderId }).eq('id', examId);
  if (error) throw error;
};

export type QuestionTag = 'mal' | 'ok' | 'bien' | 'excelente';

export const saveQuestionTag = async (questionId: string, examId: string, tag: QuestionTag): Promise<void> => {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('question_tags').upsert(
    {
      user_id: u.user!.id,
      question_id: questionId,
      exam_id: examId,
      tag,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,question_id' },
  );
  if (error) throw error;
};

// ───────────────────────── Edición de simulacros ─────────────────────────

// Una pregunta en el formulario de edición. id === null significa "pregunta nueva".
export interface EditableQuestion {
  id: string | null;
  type: QType;
  prompt: string;
  options: { id: string; text: string }[] | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answer: any;
  explanation: string | null;
  imagen_url: string | null;
}

export interface ExamEdits {
  title: string;
  subject: string;
  description: string;
}

export const fetchExamForEdit = async (examId: string): Promise<{ exam: Exam; questions: EditableQuestion[] }> => {
  const { data: exam, error: e1 } = await supabase.from('exams').select('*').eq('id', examId).single();
  if (e1) throw e1;
  const { data: qs, error: e2 } = await supabase
    .from('questions')
    .select('id,type,prompt,options,answer,explanation,imagen_url')
    .eq('exam_id', examId)
    .order('position', { ascending: true });
  if (e2) throw e2;
  return { exam: exam as Exam, questions: (qs ?? []) as EditableQuestion[] };
};

// Guarda los cambios sin recrear las preguntas existentes (así se conservan
// las etiquetas Mal/Ok/Bien/Excelente y el historial). El orden es a propósito:
// primero se actualiza y se agrega, y solo al final se elimina.
export const saveExamEdits = async (
  examId: string,
  edits: ExamEdits,
  questions: EditableQuestion[],
  deletedIds: string[],
): Promise<void> => {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user!.id;

  const indexed = questions.map((q, position) => ({ q, position }));

  // 1) Actualizar las preguntas que ya existían
  const updates = await Promise.all(
    indexed
      .filter(({ q }) => q.id)
      .map(({ q, position }) =>
        supabase
          .from('questions')
          .update({
            position,
            prompt: q.prompt.trim(),
            options: q.options,
            answer: q.answer,
            explanation: q.explanation?.trim() || null,
            imagen_url: q.imagen_url || null,
          })
          .eq('id', q.id!),
      ),
  );
  const failed = updates.find((r) => r.error);
  if (failed?.error) throw failed.error;

  // 2) Insertar las preguntas nuevas
  const fresh = indexed
    .filter(({ q }) => !q.id)
    .map(({ q, position }) => ({
      exam_id: examId,
      user_id: userId,
      position,
      type: q.type,
      prompt: q.prompt.trim(),
      options: q.options,
      answer: q.answer,
      explanation: q.explanation?.trim() || null,
      imagen_url: q.imagen_url || null,
    }));
  if (fresh.length) {
    const { error } = await supabase.from('questions').insert(fresh);
    if (error) throw error;
  }

  // 3) Eliminar las preguntas quitadas (su etiqueta se borra en cascada)
  if (deletedIds.length) {
    const { error } = await supabase.from('questions').delete().eq('exam_id', examId).in('id', deletedIds);
    if (error) throw error;
  }

  // 4) Actualizar el simulacro (título, tema, descripción y contador)
  const { error } = await supabase
    .from('exams')
    .update({
      title: edits.title.trim(),
      subject: edits.subject.trim() || null,
      description: edits.description.trim() || null,
      question_count: questions.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', examId);
  if (error) throw error;
};

// ───────────────────────── Lista de repaso ─────────────────────────

export interface ReviewEntry {
  created_at: string;
  exam_id: string;
  exam_title: string;
  question: Question;
}

interface RawReviewRow {
  created_at: string;
  exam_id: string;
  questions: Question | null;
  exams: { title: string } | null;
}

// Ids de las preguntas que el usuario tiene guardadas en su lista de repaso
export const fetchReviewIds = async (): Promise<string[]> => {
  const { data, error } = await supabase.from('review_questions').select('question_id');
  if (error) throw error;
  return (data ?? []).map((r) => r.question_id as string);
};

export const addToReview = async (questionId: string, examId: string): Promise<void> => {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('review_questions')
    .upsert(
      { user_id: u.user!.id, question_id: questionId, exam_id: examId },
      { onConflict: 'user_id,question_id', ignoreDuplicates: true },
    );
  if (error) throw error;
};

export const removeFromReview = async (questionId: string): Promise<void> => {
  const { error } = await supabase.from('review_questions').delete().eq('question_id', questionId);
  if (error) throw error;
};

export const fetchReviewEntries = async (): Promise<ReviewEntry[]> => {
  const { data, error } = await supabase
    .from('review_questions')
    .select('created_at,exam_id,questions(*),exams(title)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawReviewRow[])
    .filter((r) => r.questions)
    .map((r) => ({
      created_at: r.created_at,
      exam_id: r.exam_id,
      exam_title: r.exams?.title ?? 'Simulacro',
      question: r.questions as Question,
    }));
};
