import { supabase } from '@/lib/supabase';

export interface Exam {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  question_count: number;
  created_at: string;
}

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
  const { data } = await supabase.from('attempts').select('exam_id,score').not('finished_at', 'is', null);
  const best: Record<string, number> = {};
  for (const a of data ?? []) best[a.exam_id] = Math.max(best[a.exam_id] ?? 0, Number(a.score));
  return best;
};
