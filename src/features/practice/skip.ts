import { sectionRanges } from '@/lib/sections';
import type { Question } from '@/lib/grading';

/*
 * Saltar una pregunta = mandarla al final de su "tramo" y seguir con la siguiente; vuelve a aparecer cuando
 * termines las demás. El tramo es la sección actual en el simulacro completo (así no se mezclan secciones ni se
 * mueven las pausas entre ellas) y toda la cola en los repasos.
 *
 * Solo se mueven preguntas que aún no se han respondido (de `index` en adelante), de modo que se sigue cumpliendo
 * que results[i] corresponde a queue[i], que es lo que esperan el avance guardado, las pausas y los resultados.
 */

/** Una pasada del último índice del tramo donde está la pregunta `index`. */
export function skipScopeEnd(queue: Pick<Question, 'section'>[], index: number, bySection: boolean): number {
  if (bySection) {
    const r = sectionRanges(queue).find((x) => index >= x.start && index < x.end);
    if (r) return r.end;
  }
  return queue.length;
}

/** ¿Queda otra pregunta por responder en el tramo, para poder saltar esta sin perderla? */
export const canSkipOver = (queue: Pick<Question, 'section'>[], index: number, bySection: boolean): boolean =>
  skipScopeEnd(queue, index, bySection) - index > 1;

/** Cola nueva con la pregunta `index` al final de su tramo. Si no hay a dónde moverla, devuelve la misma cola. */
export function moveToEndOfScope<T extends Pick<Question, 'section'>>(queue: T[], index: number, bySection: boolean): T[] {
  if (!canSkipOver(queue, index, bySection)) return queue;
  const end = skipScopeEnd(queue, index, bySection);
  const next = [...queue];
  const [q] = next.splice(index, 1);
  next.splice(end - 1, 0, q);
  return next;
}
