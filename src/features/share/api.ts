import { supabase } from '@/lib/supabase';
import type { Question } from '@/lib/grading';
import { driveConnected, setFilesPublic } from '@/lib/drive';
import { collectMediaRefs, makeShortId, shareUrl } from './shareLogic';

/** Dirección pública de la app (la del APK no sirve para compartir). */
export const PUBLIC_BASE = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || 'https://simulacro-pro.vercel.app';
export const linkFor = (shortId: string) => shareUrl(PUBLIC_BASE, shortId);

export interface SharedLink {
  id: string;
  short_id: string;
  exam_id: string;
  views: number;
  copies: number;
  is_active: boolean;
  created_at: string;
  exams?: { title: string } | null;
}
const COLS = 'id,short_id,exam_id,views,copies,is_active,created_at';

/** Archivos (imágenes y audios) de un simulacro. */
export async function fetchExamMediaRefs(examId: string): Promise<string[]> {
  const { data, error } = await supabase.from('questions').select('*').eq('exam_id', examId);
  if (error) throw new Error(error.message);
  return collectMediaRefs((data ?? []) as { imagen_url?: string | null; audio_url?: string | null }[]);
}

/** El enlace del simulacro; si no existe, lo crea (un solo enlace por simulacro). */
export async function getOrCreateLink(examId: string): Promise<SharedLink> {
  const found = await supabase.from('shared_links').select(COLS).eq('exam_id', examId).maybeSingle();
  if (found.error) throw new Error(found.error.message);
  if (found.data) return found.data as SharedLink;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabase.from('shared_links').insert({ short_id: makeShortId(), exam_id: examId }).select(COLS).single();
    if (!error) return data as SharedLink;
    if (error.code !== '23505') throw new Error(error.message); // 23505 = código repetido: se prueba otro
    const again = await supabase.from('shared_links').select(COLS).eq('exam_id', examId).maybeSingle();
    if (again.data) return again.data as SharedLink; // otro clic ya lo había creado
  }
  throw new Error('No se pudo crear el enlace. Inténtalo de nuevo.');
}

export async function fetchLink(examId: string): Promise<SharedLink | null> {
  const { data, error } = await supabase.from('shared_links').select(COLS).eq('exam_id', examId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SharedLink | null) ?? null;
}

export async function listLinks(): Promise<SharedLink[]> {
  const { data, error } = await supabase.from('shared_links').select(`${COLS},exams(title)`).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SharedLink[];
}

export type MediaStatus = 'none' | 'ok' | 'nodrive' | 'partial';
export interface MediaResult {
  status: MediaStatus;
  total: number;
  failed: number;
}

/**
 * Deja los archivos del simulacro legibles (o ya no) por quien tenga el enlace; sin eso nadie más puede verlos ni copiarlos.
 * Si el creador no tiene el Drive conectado, avisa con 'nodrive' sin fallar.
 */
export async function publishMedia(examId: string, on: boolean): Promise<MediaResult> {
  const refs = await fetchExamMediaRefs(examId);
  if (!refs.length) return { status: 'none', total: 0, failed: 0 };
  if (!(await driveConnected())) return { status: 'nodrive', total: refs.length, failed: refs.length };
  const r = await setFilesPublic(refs, on);
  return { status: r.failed ? 'partial' : 'ok', total: refs.length, failed: r.failed };
}

export async function setLinkActive(link: SharedLink, active: boolean): Promise<MediaResult> {
  const { error } = await supabase.from('shared_links').update({ is_active: active }).eq('id', link.id);
  if (error) throw new Error(error.message);
  // Al desactivar, el servidor ya no entrega los archivos; además se intenta quitar el acceso público en Drive.
  try {
    return await publishMedia(link.exam_id, active);
  } catch {
    return { status: 'partial', total: 0, failed: 0 };
  }
}

/* ───────────── Lado del visitante ───────────── */

export interface SharedReading {
  id: string;
  position: number;
  title: string;
  body: string;
  section?: string | null;
}
export interface SharedExam {
  short_id: string;
  is_owner: boolean;
  exam: { title: string; description: string | null; subject: string | null; time_limit_min: number | null; question_count: number };
  readings: SharedReading[];
  questions: (Question & { audio_url?: string | null })[];
}

/** Lee un simulacro compartido (funciona sin iniciar sesión). null = el enlace no existe o está desactivado. */
export async function fetchShared(shortId: string): Promise<SharedExam | null> {
  const { data, error } = await supabase.rpc('get_shared_exam', { p_short: shortId });
  if (error) throw new Error(error.message);
  return (data as SharedExam | null) ?? null;
}

/** Copia el simulacro a la cuenta del usuario con sesión. `imageMap` = { "gd:viejo": "gd:nuevo" }. Devuelve el id del simulacro nuevo. */
export async function copySharedExam(shortId: string, imageMap: Record<string, string>): Promise<string> {
  const { data, error } = await supabase.rpc('copy_shared_exam', { p_short: shortId, p_image_map: imageMap });
  if (error) throw new Error(error.message);
  return data as string;
}
