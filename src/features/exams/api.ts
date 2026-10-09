import { supabase } from '@/lib/supabase';

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
  const { data } = await supabase.from('attempts').select('exam_id,score').not('finished_at', 'is', null);
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
