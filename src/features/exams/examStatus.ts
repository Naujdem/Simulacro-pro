/*
 * Estado de un simulacro en las listas:
 *  - 'pending'  (amarillo): lo empezaste y lo dejaste a medias (hay un avance guardado sin terminar).
 *  - 'perfect'  (check):    tu último intento completo no tuvo ningún error.
 *  - 'errors'   (rojo):     tu último intento completo terminó, pero con respuestas incorrectas.
 *  - 'none':                nunca lo has hecho: no se muestra indicador.
 *
 * Si hay un avance a medias, manda el amarillo aunque antes lo hubieras terminado (estás repitiéndolo).
 */

export type ExamStatus = 'none' | 'pending' | 'perfect' | 'errors';

/** Último intento completo (modo 'full') de un simulacro. */
export interface LastFinished {
  total: number;
  correct: number;
}

export function examStatus(hasPendingProgress: boolean, last: LastFinished | undefined): ExamStatus {
  if (hasPendingProgress) return 'pending';
  if (!last || last.total <= 0) return 'none';
  return last.correct >= last.total ? 'perfect' : 'errors';
}
