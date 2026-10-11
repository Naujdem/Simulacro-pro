import { supabase } from '@/lib/supabase';
import { correctText, type Question } from '@/lib/grading';
import { cleanMarkdown, titleFrom } from './markdown';
import { getProvider, PROVIDER_NAMES, type AiProvider } from '@/features/ai/translate';

/** Mínimo de preguntas falladas para ofrecer la sugerencia. */
export const MIN_FAILED = 3;

export interface Suggestion {
  id: string;
  exam_id: string | null;
  title: string;
  content: string;
  failed_count: number;
  helpful: boolean | null;
  created_at: string;
}

/** Sugerencia recién generada (todavía sin guardar). */
export interface Draft {
  examId: string | null;
  title: string;
  content: string;
  failedCount: number;
  provider: AiProvider;
  usedOther: boolean;
}

const showPrompt = (p: string) => p.replace(/\{\{\d+\}\}/g, '____');

interface Reply {
  ok: boolean;
  markdown?: string;
  proveedor?: AiProvider;
  mensaje?: string;
}

/** Pide a la IA (función ia-sugerencia) una sugerencia de estudio a partir de las preguntas falladas. */
export async function generateSuggestion(args: {
  examId: string | null;
  examTitle: string;
  failed: Question[];
  sections: string[];
  provider?: AiProvider;
}): Promise<Draft> {
  const provider = args.provider ?? getProvider();
  const { data, error } = await supabase.functions.invoke('ia-sugerencia', {
    body: {
      titulo: args.examTitle,
      secciones: args.sections,
      proveedor: provider,
      falladas: args.failed.map((q) => ({
        pregunta: showPrompt(q.prompt),
        correcta: correctText(q),
        explicacion: q.explanation ?? undefined,
        seccion: q.section ?? undefined,
      })),
    },
  });
  if (error) throw new Error('No se pudo contactar la función ia-sugerencia. Revisa que esté desplegada en Supabase.');
  const r = data as Reply | null;
  if (!r) throw new Error('La función no devolvió nada.');
  if (!r.ok || !r.markdown) throw new Error(r.mensaje ?? 'No se pudo generar la sugerencia.');
  const content = cleanMarkdown(r.markdown);
  const used = r.proveedor ?? provider;
  return {
    examId: args.examId,
    title: titleFrom(content, args.examTitle),
    content,
    failedCount: args.failed.length,
    provider: used,
    usedOther: used !== provider,
  };
}

export const providerName = (p: AiProvider) => PROVIDER_NAMES[p];

const COLS = 'id,exam_id,title,content,failed_count,helpful,created_at';

export async function saveSuggestion(d: Draft, helpful: boolean | null): Promise<Suggestion> {
  const { data, error } = await supabase
    .from('study_suggestions')
    .insert({ exam_id: d.examId, title: d.title, content: d.content, failed_count: d.failedCount, helpful })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as Suggestion;
}

export async function fetchSuggestions(): Promise<Suggestion[]> {
  const { data, error } = await supabase.from('study_suggestions').select(COLS).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Suggestion[];
}

export async function fetchSuggestion(id: string): Promise<Suggestion> {
  const { data, error } = await supabase.from('study_suggestions').select(COLS).eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as Suggestion;
}

export async function setHelpful(id: string, helpful: boolean | null): Promise<void> {
  const { error } = await supabase.from('study_suggestions').update({ helpful }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSuggestion(id: string): Promise<void> {
  const { error } = await supabase.from('study_suggestions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
