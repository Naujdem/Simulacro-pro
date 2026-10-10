export type Rating = 'again' | 'hard' | 'good' | 'easy';

/** Datos de SM-2 de cada ficha (columnas ease_factor, interval_days, repetitions) + el paso de aprendizaje de la sesión. */
export interface Sm2State {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  /** Paso de aprendizaje en el que va la ficha. Solo vive durante la sesión (no se guarda): al reabrir empieza en el 0. */
  step?: number;
}

/** Resultado de calificar: el nuevo estado + la fecha del próximo repaso */
export interface Sm2Result extends Sm2State {
  step: number;
  dueAt: Date;
  /** Si la ficha sigue aprendiéndose: en cuántos minutos vuelve a salir. Si ya pasó a días, no existe. */
  delayMinutes?: number;
}

/** Valores de una ficha nueva */
export const INITIAL_SM2: Sm2State = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };

/* ───────────── Ajustes (como los de un mazo de Anki) ───────────── */

/** Pasos de una ficha nueva, en minutos: 1 min → 10 min → pasa a días. */
export const LEARNING_STEPS = [1, 10];
/** Paso de una ficha que fallaste en un repaso, en minutos. */
export const RELEARN_STEPS = [10];
/** Días que tarda una ficha nueva al terminar sus pasos (botón "Bien"). */
export const GRADUATING_DAYS = 1;
/** Días que tarda una ficha nueva si la marcas "Fácil" desde el principio. */
export const EASY_DAYS = 1;
/** Días a los que vuelve una ficha de repaso que fallas. */
export const LAPSE_DAYS = 1;

const HARD_FACTOR = 1.2; // "Difícil" multiplica el intervalo por esto
const EASY_BONUS = 1.3; // "Fácil" añade este extra sobre "Bien"

// Cada botón equivale a una "calidad" de recuerdo (escala 0-5 del algoritmo SM-2); solo ajusta la facilidad de los repasos
const QUALITY: Record<Rating, number> = { again: 1, hard: 3, good: 4, easy: 5 };
const MIN_EASE = 1.3;

/** Medianoche (hora local) de hoy + N días. Así la ficha "toca" desde el inicio de ese día. */
function startOfDayPlus(now: Date, days: number): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * En qué etapa está la ficha según lo que se guarda en la base de datos:
 *  - learning: nueva o aprendiéndose (sin repeticiones ni intervalo todavía)
 *  - relearning: fallada en un repaso (sin repeticiones pero con el intervalo al que volverá)
 *  - review: ya pasa por días
 */
export type Phase = 'learning' | 'relearning' | 'review';
export function phaseOf(s: Pick<Sm2State, 'intervalDays' | 'repetitions'>): Phase {
  if (s.repetitions >= 1) return 'review';
  return s.intervalDays >= 1 ? 'relearning' : 'learning';
}

/** "Difícil" en un paso: a medio camino del siguiente (1 y 10 → 6 min); en el último, paso × 1.5. */
function hardDelay(steps: number[], step: number): number {
  return step === 0 && steps.length > 1 ? Math.round((steps[0] + steps[1]) / 2) : Math.round(steps[step] * 1.5);
}

/** Calcula el nuevo estado de una ficha y cuándo toca repasarla, según la calificación. */
export function nextReview(state: Sm2State, rating: Rating, now: Date = new Date()): Sm2Result {
  const { easeFactor, intervalDays, repetitions } = state;

  // La ficha sigue aprendiéndose: vuelve a salir en unos minutos
  const stay = (step: number, delayMinutes: number, ease = easeFactor, ivl = intervalDays): Sm2Result => ({
    easeFactor: ease,
    intervalDays: ivl,
    repetitions: 0,
    step,
    delayMinutes,
    dueAt: new Date(now.getTime() + delayMinutes * 60_000),
  });
  // La ficha pasa a repasarse por días
  const graduate = (days: number, ease = easeFactor, reps = 1): Sm2Result => ({
    easeFactor: ease,
    intervalDays: days,
    repetitions: reps,
    step: 0,
    dueAt: startOfDayPlus(now, days),
  });

  const phase = phaseOf(state);

  if (phase === 'learning') {
    const step = Math.min(Math.max(0, state.step ?? 0), LEARNING_STEPS.length - 1);
    if (rating === 'again') return stay(0, LEARNING_STEPS[0]);
    if (rating === 'hard') return stay(step, hardDelay(LEARNING_STEPS, step));
    if (rating === 'easy') return graduate(EASY_DAYS);
    return step + 1 < LEARNING_STEPS.length ? stay(step + 1, LEARNING_STEPS[step + 1]) : graduate(GRADUATING_DAYS);
  }

  if (phase === 'relearning') {
    if (rating === 'again') return stay(0, RELEARN_STEPS[0]);
    if (rating === 'hard') return stay(0, hardDelay(RELEARN_STEPS, 0));
    const days = Math.max(1, intervalDays);
    return graduate(rating === 'easy' ? days + 1 : days);
  }

  // Repaso: Difícil < Bien < Fácil siempre, y los tres crecen con el intervalo actual
  const q = QUALITY[rating];
  const ease = Math.max(MIN_EASE, Math.round((easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)) * 100) / 100);
  if (rating === 'again') return stay(0, RELEARN_STEPS[0], ease, LAPSE_DAYS);

  const hard = Math.max(intervalDays + 1, Math.round(intervalDays * HARD_FACTOR));
  const good = Math.max(hard + 1, Math.round(intervalDays * easeFactor));
  const easy = Math.max(good + 1, Math.round(intervalDays * easeFactor * EASY_BONUS));
  return graduate({ hard, good, easy }[rating], ease, repetitions + 1);
}

/** "6 d", "2 meses", "1 año"… (para ≥ 1 día). */
export function formatDays(days: number): string {
  if (days < 30) return `${days} d`;
  if (days < 365) {
    const m = Math.round((days / 30) * 10) / 10;
    return `${m.toLocaleString('es')} ${m === 1 ? 'mes' : 'meses'}`;
  }
  const y = Math.round((days / 365) * 10) / 10;
  return `${y.toLocaleString('es')} ${y === 1 ? 'año' : 'años'}`;
}

/** "1 min", "10 min", "1,5 h"… (para menos de un día). */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h.toLocaleString('es')} h`;
}

/** Texto que se muestra bajo cada botón: cuánto tardará en volver a aparecer la ficha. */
export function describeInterval(result: Pick<Sm2Result, 'intervalDays' | 'delayMinutes'>): string {
  return result.delayMinutes !== undefined ? formatMinutes(result.delayMinutes) : formatDays(result.intervalDays);
}
