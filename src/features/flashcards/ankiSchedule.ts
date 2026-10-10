import type { RawSched } from './ankiParser';
import { INITIAL_SM2, type Sm2State } from './sm2';

/** Estado SM-2 con el que se guarda cada ficha importada. */
export interface ImportSchedule extends Sm2State {
  dueAt: Date;
}

export interface ScheduleOptions {
  /** Creación de la colección de Anki (segundos Unix); los repasos de Anki se cuentan en días desde ahí. */
  crt: number;
  /** Conservar intervalo/facilidad/fecha de las tarjetas que ya se habían estudiado en Anki. */
  keepProgress: boolean;
  now?: Date;
}

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * Programa cada ficha importada (el resultado va en el mismo orden que `cards`):
 *  - Nuevas: quedan sin estudiar (SM-2 inicial). Cuántas salen cada día lo decide la opción
 *    "nuevas por día" de su mazo, no la fecha: así puedes cambiar el ritmo cuando quieras.
 *  - Ya estudiadas en Anki (si keepProgress): conservan su intervalo, facilidad y fecha de repaso.
 *  - En aprendizaje: empiezan hoy como nuevas.
 */
export function scheduleImportedCards(
  cards: { deck: string; sched: RawSched }[],
  { crt, keepProgress, now = new Date() }: ScheduleOptions,
): ImportSchedule[] {
  const today = startOfDay(now);

  return cards.map((c) => {
    const s = c.sched;
    const studied = keepProgress && (s.type === 2 || s.type === 3);
    if (!studied) return { ...INITIAL_SM2, dueAt: today };

    // Repaso / reaprendiendo: se respeta lo que Anki ya calculó
    const intervalDays = s.ivl > 0 ? s.ivl : 1;
    const easeFactor = Math.max(1.3, (s.factor || 2500) / 1000);
    const repetitions = intervalDays < 6 ? 1 : Math.max(2, s.reps - s.lapses);

    let dueAt = startOfDay(new Date(crt * 1000 + s.due * DAY_MS));
    if (Number.isNaN(dueAt.getTime()) || s.due <= 0) dueAt = addDays(today, intervalDays);
    if (dueAt < today) dueAt = today; // atrasada: toca hoy

    return { easeFactor, intervalDays, repetitions, dueAt };
  });
}
