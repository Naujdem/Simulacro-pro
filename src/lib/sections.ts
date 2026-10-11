import type { Question } from './grading';

/*
 * Secciones dentro de un simulacro ("Gramática", "Lectura 1: …"). Cada pregunta guarda el nombre de su sección
 * (columna `section`); las secciones salen en el orden en que aparecen. Los simulacros sin sección (los de antes)
 * cuentan como una sola, así que no cambian: no hay pausas.
 */

export const DEFAULT_SECTION = 'General';

export const sectionName = (q: { section?: string | null }): string => q.section?.trim() || DEFAULT_SECTION;

/** Junta las preguntas de cada sección conservando el orden de primera aparición (y el orden interno). */
export function groupBySection<T extends { section?: string | null }>(qs: T[]): T[] {
  const order = new Map<string, number>();
  for (const q of qs) {
    const n = sectionName(q);
    if (!order.has(n)) order.set(n, order.size);
  }
  if (order.size <= 1) return qs;
  return qs
    .map((q, i) => ({ q, i }))
    .sort((a, b) => order.get(sectionName(a.q))! - order.get(sectionName(b.q))! || a.i - b.i)
    .map((x) => x.q);
}

export interface SectionRange {
  name: string;
  /** Primera pregunta de la sección (índice en la cola). */
  start: number;
  /** Una pasada de la última (exclusivo). */
  end: number;
}

/** Tramos seguidos de la cola que comparten sección. Con una sola sección devuelve [] (no hay nada que separar). */
export function sectionRanges(qs: Pick<Question, 'section'>[]): SectionRange[] {
  const out: SectionRange[] = [];
  qs.forEach((q, i) => {
    const name = sectionName(q);
    const last = out[out.length - 1];
    if (last && last.name === name) last.end = i + 1;
    else out.push({ name, start: i, end: i + 1 });
  });
  return out.length > 1 ? out : [];
}

export interface SectionStats extends SectionRange {
  total: number;
  answered: number;
  correct: number;
  wrong: number;
  timeMs: number;
}

/** Aciertos, errores y tiempo de un tramo, según las respuestas dadas hasta ahora (results[i] es la pregunta i). */
export function sectionStats(r: SectionRange, results: { correct: boolean; timeMs: number }[]): SectionStats {
  const done = results.slice(r.start, r.end);
  const correct = done.filter((x) => x.correct).length;
  return {
    ...r,
    total: r.end - r.start,
    answered: done.length,
    correct,
    wrong: done.length - correct,
    timeMs: done.reduce((s, x) => s + x.timeMs, 0),
  };
}

/** Si en `index` empieza una sección nueva (y no es la primera), devuelve su posición en `ranges`; si no, -1. */
export const boundaryAt = (ranges: SectionRange[], index: number): number => (index > 0 ? ranges.findIndex((r) => r.start === index) : -1);
