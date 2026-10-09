export type Rating = 'again' | 'hard' | 'good' | 'easy';

/** Los 3 datos de SM-2 que guarda cada ficha (columnas ease_factor, interval_days, repetitions) */
export interface Sm2State {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

/** Resultado de calificar: el nuevo estado + la fecha del próximo repaso */
export interface Sm2Result extends Sm2State {
  dueAt: Date;
}

/** Valores de una ficha nueva */
export const INITIAL_SM2: Sm2State = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };

// Cada botón equivale a una "calidad" de recuerdo (escala 0-5 del algoritmo SM-2)
const QUALITY: Record<Rating, number> = { again: 1, hard: 3, good: 4, easy: 5 };
const MIN_EASE = 1.3;

/** Medianoche (hora local) de hoy + N días. Así la ficha "toca" desde el inicio de ese día. */
function startOfDayPlus(now: Date, days: number): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

/** Calcula el nuevo estado de una ficha y cuándo toca repasarla, según la calificación. */
export function nextReview(state: Sm2State, rating: Rating, now: Date = new Date()): Sm2Result {
  const q = QUALITY[rating];
  let { easeFactor, intervalDays, repetitions } = state;

  if (q < 3) {
    // Otra vez: se reinicia y vuelve mañana
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 6;
    else if (rating === 'hard') intervalDays = Math.max(intervalDays + 1, Math.round(intervalDays * 1.2));
    else intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
    repetitions += 1;
  }

  // Ajuste de facilidad (fórmula original de SM-2), nunca menor a 1.3
  easeFactor += 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  easeFactor = Math.max(MIN_EASE, Math.round(easeFactor * 100) / 100);

  return { easeFactor, intervalDays, repetitions, dueAt: startOfDayPlus(now, intervalDays) };
}
