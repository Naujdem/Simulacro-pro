import { supabase } from '@/lib/supabase';
import type { QType } from '@/lib/importParser';

/* ───────────────────────── Tipos ───────────────────────── */

export type AiAccion = 'explicar' | 'similares';

// Una pregunta generada por la IA (mismo formato que la tabla `questions`)
export interface GeneratedQuestion {
  type: QType;
  prompt: string;
  options: { id: string; text: string }[] | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answer: any;
  explanation: string | null;
}

export interface ExplanationContent {
  texto: string;
}

export interface SimilarContent {
  preguntas: GeneratedQuestion[];
}

export interface AiOk<T> {
  ok: true;
  origen: 'cache' | 'ia'; // 'cache' = no gastó ninguna solicitud de IA
  accion: AiAccion;
  contenido: T;
  proveedor: string | null;
  modelo: string | null;
  simulacro_id: string | null; // si ya guardaste estas preguntas como simulacro
}

interface AiFail {
  ok: false;
  error: string;
  mensaje: string;
}

export class AiError extends Error {}

/* ───────────────────────── Llamada a la Edge Function ───────────────────────── */

// La función revisa primero el cache (tabla ia_cache); solo llama a la IA si no hay nada guardado.
async function callAi<T>(preguntaId: string, accion: AiAccion): Promise<AiOk<T>> {
  const { data, error } = await supabase.functions.invoke('ia-pregunta', {
    body: { pregunta_id: preguntaId, accion },
  });
  if (error) {
    throw new AiError('No se pudo contactar la función ia-pregunta. Revisa que esté desplegada.');
  }
  const r = data as AiOk<T> | AiFail | null;
  if (!r) throw new AiError('La función no devolvió nada.');
  if (!r.ok) throw new AiError(r.mensaje);
  return r;
}

export const explainQuestion = (preguntaId: string) => callAi<ExplanationContent>(preguntaId, 'explicar');

export const similarQuestions = (preguntaId: string) => callAi<SimilarContent>(preguntaId, 'similares');

/* ───────────────────────── Estado del cache (lectura gratuita) ───────────────────────── */

export interface AiCacheInfo {
  explicacion: boolean;
  similares: boolean;
  simulacroId: string | null; // simulacro donde ya guardaste las preguntas similares
}

// Solo lee la tabla ia_cache: no usa la IA ni gasta solicitudes.
export const fetchAiCacheInfo = async (preguntaId: string): Promise<AiCacheInfo> => {
  const { data, error } = await supabase
    .from('ia_cache')
    .select('tipo,simulacro_id')
    .eq('pregunta_id', preguntaId);
  if (error) throw error;
  const filas = (data ?? []) as { tipo: string; simulacro_id: string | null }[];
  const sim = filas.find((f) => f.tipo === 'similares');
  return {
    explicacion: filas.some((f) => f.tipo === 'explicacion'),
    similares: !!sim,
    simulacroId: sim?.simulacro_id ?? null,
  };
};

/* ───────────────────────── Guardar como simulacro ───────────────────────── */

// Crea un simulacro nuevo en la MISMA biblioteca del original, con las preguntas generadas.
// Devuelve el id del nuevo simulacro.
export async function saveSimilarAsExam(
  preguntaId: string,
  examId: string,
  preguntaOriginal: string,
  generadas: GeneratedQuestion[],
): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user!.id;

  const { data: orig, error: e0 } = await supabase
    .from('exams')
    .select('title,subject,folder_id')
    .eq('id', examId)
    .single();
  if (e0) throw e0;

  const resumen = preguntaOriginal.replace(/\{\{\d+\}\}/g, '____').replace(/\s+/g, ' ').trim();
  const corto = resumen.length > 45 ? `${resumen.slice(0, 45)}…` : resumen;

  const { data: exam, error: e1 } = await supabase
    .from('exams')
    .insert({
      user_id: userId,
      title: `Similares: ${corto}`,
      subject: orig.subject,
      description: `Preguntas generadas con IA a partir de una pregunta de "${orig.title}".`,
      folder_id: orig.folder_id,
      question_count: generadas.length,
    })
    .select('id')
    .single();
  if (e1) throw e1;

  const rows = generadas.map((g, position) => ({
    exam_id: exam.id,
    user_id: userId,
    position,
    type: g.type,
    prompt: g.prompt,
    options: g.type === 'multiple_choice' ? g.options : null,
    answer: g.answer,
    explanation: g.explanation,
    imagen_url: null,
  }));
  const { error: e2 } = await supabase.from('questions').insert(rows);
  if (e2) {
    // No dejar un simulacro vacío si falló el guardado de las preguntas
    await supabase.from('exams').delete().eq('id', exam.id);
    throw e2;
  }

  // Recordar que ya se guardaron, para no duplicar el simulacro
  await supabase
    .from('ia_cache')
    .update({ simulacro_id: exam.id })
    .eq('pregunta_id', preguntaId)
    .eq('tipo', 'similares');

  return exam.id as string;
}
