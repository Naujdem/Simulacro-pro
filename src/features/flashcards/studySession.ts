/** Ficha que se calificó "Otra vez" y debe reaparecer en esta misma sesión cuando pase su minuto. */
export interface LearningEntry<T> {
  card: T;
  due: number; // ms
}

const earliest = <T>(learning: LearningEntry<T>[], onlyDue: number | null): number => {
  let idx = -1;
  learning.forEach((l, i) => {
    if (onlyDue !== null && l.due > onlyDue) return;
    if (idx < 0 || l.due < learning[idx].due) idx = i;
  });
  return idx;
};

/**
 * Elige la siguiente ficha de la sesión:
 *  1. una de "Otra vez" cuyo tiempo ya pasó,
 *  2. la siguiente de la cola,
 *  3. si ya no queda cola, la de "Otra vez" que venza antes (aunque falte poco: no tiene sentido hacerte esperar).
 */
export function pickNext<T>(queue: T[], learning: LearningEntry<T>[], now: number) {
  const dueIdx = earliest(learning, now);
  if (dueIdx >= 0) {
    return { current: learning[dueIdx].card, queue, learning: learning.filter((_, i) => i !== dueIdx) };
  }
  if (queue.length > 0) return { current: queue[0], queue: queue.slice(1), learning };
  const idx = earliest(learning, null);
  if (idx >= 0) return { current: learning[idx].card, queue, learning: learning.filter((_, i) => i !== idx) };
  return { current: null as T | null, queue, learning };
}
