import { supabase } from '@/lib/supabase';
import type { AiProvider } from '@/features/ai/translate';
import type { Block } from './epub';

/*
 * Actividades de comprensión al terminar un capítulo (como las de los libros de inglés), creadas con IA por la función
 * «ia-actividades». Aquí se pide, se revisa lo que devolvió la IA (puede venir incompleto o con errores) y se deja listo
 * para mostrar.
 */

export interface Mcq {
  question: string;
  options: string[];
  /** Posición de la opción correcta. */
  correct: number;
  explanation: string;
}
export interface TrueFalse {
  statement: string;
  answer: boolean;
  explanation: string;
}
export interface VocabItem {
  word: string;
  translation: string;
}
export interface Activities {
  mcq: Mcq[];
  tf: TrueFalse[];
  vocab: VocabItem[];
  /** Preguntas abiertas para conversar o escribir. */
  speaking: string[];
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Mezcla las opciones para que la correcta no quede siempre en el mismo lugar (la IA suele poner la primera). */
function shuffled<T>(items: T[], rnd: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Acepta 0, "0", "a", "A" o el texto de la opción como «correcta». -1 si no se entiende. */
function correctIndex(raw: unknown, options: string[]): number {
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw >= 0 && raw < options.length ? raw : -1;
  if (typeof raw !== 'string') return -1;
  const s = raw.trim();
  // Un número o una letra valen como posición solo si caben; si no (ej. la opción "36"), se busca como texto de la opción
  if (/^\d+$/.test(s) && Number(s) < options.length) return Number(s);
  if (/^[a-dA-D]$/.test(s) && s.toLowerCase().charCodeAt(0) - 97 < options.length) return s.toLowerCase().charCodeAt(0) - 97;
  return options.findIndex((o) => o.toLowerCase() === s.toLowerCase());
}

const asBool = (v: unknown): boolean | null => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 'verdadero', 'v', 'sí', 'si'].includes(s)) return true;
    if (['false', 'falso', 'f', 'no'].includes(s)) return false;
  }
  return null;
};

/**
 * Revisa lo que devolvió la IA: descarta lo que esté incompleto o mal formado, limita las cantidades y mezcla las
 * opciones. Devuelve null si no quedó ninguna pregunta utilizable.
 */
export function parseActivities(raw: unknown, rnd: () => number = Math.random): Activities | null {
  const r = obj(raw);

  const mcq: Mcq[] = [];
  for (const item of list(r.comprension)) {
    const q = obj(item);
    const question = str(q.pregunta, 300);
    const options = list(q.opciones).map((o) => str(o, 200)).filter(Boolean);
    const unique = new Set(options.map((o) => o.toLowerCase()));
    if (!question || options.length < 2 || options.length > 5 || unique.size !== options.length) continue;
    const right = correctIndex(q.correcta, options);
    if (right < 0) continue;
    const order = shuffled(options.map((_, i) => i), rnd);
    mcq.push({ question, options: order.map((i) => options[i]), correct: order.indexOf(right), explanation: str(q.explicacion, 300) });
  }

  const tf: TrueFalse[] = [];
  for (const item of list(r.verdadero_falso)) {
    const q = obj(item);
    const statement = str(q.afirmacion, 300);
    const answer = asBool(q.verdadero);
    if (statement && answer !== null) tf.push({ statement, answer, explanation: str(q.explicacion, 300) });
  }

  const vocab: VocabItem[] = [];
  for (const item of list(r.vocabulario)) {
    const v = obj(item);
    const word = str(v.palabra, 60);
    const translation = str(v.traduccion, 120);
    if (word && translation && !vocab.some((x) => x.word.toLowerCase() === word.toLowerCase())) vocab.push({ word, translation });
  }

  const speaking = list(r.conversacion).map((s) => str(s, 300)).filter(Boolean);

  if (!mcq.length && !tf.length) return null;
  return { mcq: mcq.slice(0, 6), tf: tf.slice(0, 5), vocab: vocab.slice(0, 8), speaking: speaking.slice(0, 3) };
}

/** Texto del capítulo para la IA: si es muy largo se envía el principio y el final (la IA tiene un límite). */
export function chapterText(blocks: Block[], max = 7000): string {
  const full = blocks.map((b) => b.text).join('\n\n');
  if (full.length <= max) return full;
  const head = Math.round(max * 0.6);
  return `${full.slice(0, head)}\n\n[…]\n\n${full.slice(full.length - (max - head))}`;
}

interface Reply {
  ok: boolean;
  actividades?: unknown;
  proveedor?: AiProvider;
  mensaje?: string;
}

export async function generateActivities(input: { title: string; chapter: string; text: string; provider: AiProvider }): Promise<{ activities: Activities; provider: AiProvider }> {
  const { data, error } = await supabase.functions.invoke('ia-actividades', {
    body: { titulo: input.title, capitulo: input.chapter, texto: input.text, proveedor: input.provider },
  });
  if (error) throw new Error('No se pudo contactar la función ia-actividades. Revisa que esté desplegada en Supabase.');
  const r = data as Reply | null;
  if (!r) throw new Error('La función no devolvió nada.');
  if (!r.ok) throw new Error(r.mensaje ?? 'No se pudieron crear las actividades.');
  const activities = parseActivities(r.actividades);
  if (!activities) throw new Error('La IA no devolvió preguntas utilizables. Prueba de nuevo o con la otra IA.');
  return { activities, provider: r.proveedor ?? input.provider };
}
