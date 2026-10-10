import type { RawSched } from './ankiParser';
import { INITIAL_SM2, type Sm2State } from './sm2';

/** Estado SM-2 con el que se guarda cada ficha importada. */
export interface ImportSchedule extends Sm2State {
  dueAt: Date;
}

export interface ScheduleOptions {
  /** Creación de la colección de Anki (segundos Unix); los repasos de Anki se cuentan en días desde ahí. */
  crt: number;
  /** Fichas nuevas que tocan por día, por mazo (Anki trae 20 por defecto). */
  newPerDay: number;
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
 *  - Nuevas: se reparten `newPerDay` por día y por mazo, en el orden del mazo. Así NO aparecen todas el
 *    primer día: hoy tocan las primeras N, mañana las siguientes N, etc.
 *  - Ya estudiadas en Anki (si keepProgress): conservan su intervalo, facilidad y fecha de repaso.
 *  - En aprendizaje: tocan hoy.
 */
export function scheduleImportedCards(
  cards: { deck: string; sched: RawSched }[],
  { crt, newPerDay, keepProgress, now = new Date() }: ScheduleOptions,
): ImportSchedule[] {
  const today = startOfDay(now);
  const perDay = Math.max(1, Math.floor(newPerDay) || 1);
  const out: ImportSchedule[] = new Array(cards.length);
  const nextSlot = new Map<string, number>(); // mazo → cuántas nuevas van ya

  cards.forEach((c, i) => {
    const s = c.sched;
    const studied = keepProgress && (s.type === 2 || s.type === 3 || s.type === 1);

    if (!studied) {
      const slot = nextSlot.get(c.deck) ?? 0;
      nextSlot.set(c.deck, slot + 1);
      out[i] = { ...INITIAL_SM2, dueAt: addDays(today, Math.floor(slot / perDay)) };
      return;
    }

    if (s.type === 1) {
      // Aprendiendo (aún no graduada): empieza hoy como nueva
      out[i] = { ...INITIAL_SM2, dueAt: today };
      return;
    }

    // Repaso / reaprendiendo: se respeta lo que Anki ya calculó
    const intervalDays = s.ivl > 0 ? s.ivl : 1;
    const easeFactor = Math.max(1.3, (s.factor || 2500) / 1000);
    const repetitions = intervalDays < 6 ? 1 : Math.max(2, s.reps - s.lapses);

    let dueAt = startOfDay(new Date(crt * 1000 + s.due * DAY_MS));
    if (Number.isNaN(dueAt.getTime()) || s.due <= 0) dueAt = addDays(today, intervalDays);
    if (dueAt < today) dueAt = today; // atrasada: toca hoy

    out[i] = { easeFactor, intervalDays, repetitions, dueAt };
  });

  return out;
}
