import type { Response } from '@/lib/grading';

/*
 * Guarda en el dispositivo el avance de un simulacro o repaso para poder continuar donde te quedaste.
 *
 * Un "slot" es una sesión independiente dentro de un simulacro: el simulacro completo ('full'), el repaso de las
 * que tengo mal ('wrong'), las guardadas en Repaso ('saved'), repetir falladas ('retry_wrong')… Así dejar a medias
 * el repaso no pisa el avance del simulacro completo.
 *
 * Solo se guardan ids y respuestas (no el texto de las preguntas): al continuar se vuelven a leer de Supabase, así
 * que si editaste el simulacro entre tanto se usa la versión actual.
 */

export type SavedMode = 'full' | 'retry_wrong' | 'custom' | 'quick_review';

export interface SavedResult {
  questionId: string;
  response: Response;
  correct: boolean;
  timeMs: number;
}

export interface SavedProgress {
  v: 1;
  examId: string;
  slot: string;
  mode: SavedMode;
  parentAttemptId?: string;
  /** Preguntas de la sesión, en orden. */
  questionIds: string[];
  /** Lista completa original (para "Repetir todo" cuando la sesión es solo de falladas). */
  allIds: string[];
  /** Respuestas dadas hasta ahora: la siguiente pregunta es results.length. */
  results: SavedResult[];
  /** Tiempo activo acumulado (no cuenta el tiempo que estuviste fuera). */
  elapsedMs: number;
  savedAt: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const PREFIX = 'simulapro:progress:v1:';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

let userId = 'anon';
export const currentProgressUser = () => userId;

/** Aviso de cambios locales (guardar / borrar) para copiarlos a la nube; ver progressSync.ts. */
export type ProgressEvent = { kind: 'save'; p: SavedProgress } | { kind: 'clear'; examId: string; slot: string };
let listener: ((e: ProgressEvent) => void) | null = null;
export const setProgressListener = (fn: ((e: ProgressEvent) => void) | null) => {
  listener = fn;
};
const notify = (e: ProgressEvent) => {
  try {
    listener?.(e);
  } catch {
    /* la nube nunca debe romper el guardado local */
  }
};

/** Se llama al iniciar sesión: cada usuario tiene su propio avance guardado en el mismo dispositivo. */
export const setProgressUser = (id: string | null | undefined) => {
  userId = id || 'anon';
};

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // modo privado o almacenamiento bloqueado: la app funciona igual, sin guardar
  }
}

const keyOf = (examId: string, slot: string) => `${PREFIX}${userId}:${examId}:${slot}`;
const lastKey = () => `${PREFIX}${userId}:last`;

function readJson(store: Store, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Una sesión terminada por completo (todas respondidas) sigue siendo válida: sirve para reintentar el guardado final. */
function isValid(p: unknown, examId: string, slot: string, now: number): p is SavedProgress {
  const s = p as Partial<SavedProgress> | null;
  if (!s || s.v !== 1 || s.examId !== examId || s.slot !== slot) return false;
  if (!Array.isArray(s.questionIds) || !s.questionIds.length || !Array.isArray(s.results) || !Array.isArray(s.allIds)) return false;
  if (s.results.length > s.questionIds.length) return false;
  if (typeof s.savedAt !== 'number' || now - s.savedAt > MAX_AGE_MS) return false;
  return s.results.every((r, i) => r && r.questionId === s.questionIds![i]);
}

export function saveProgress(p: SavedProgress, store: Store | null = defaultStore()): void {
  if (!store) return;
  try {
    store.setItem(keyOf(p.examId, p.slot), JSON.stringify(p));
    store.setItem(lastKey(), JSON.stringify({ examId: p.examId, slot: p.slot }));
  } catch {
    /* sin espacio o sin permiso: se sigue sin guardar */
  }
  notify({ kind: 'save', p });
}

/** Escribe un avance que llegó de la nube (no vuelve a avisar, para no rebotar). Deja que "Continuar" lo encuentre. */
export function writeProgressLocal(p: SavedProgress, store: Store | null = defaultStore()): void {
  if (!store) return;
  try {
    store.setItem(keyOf(p.examId, p.slot), JSON.stringify(p));
    if (!readJson(store, lastKey())) store.setItem(lastKey(), JSON.stringify({ examId: p.examId, slot: p.slot }));
  } catch {
    /* nada */
  }
}

/** Quita un avance local sin avisar a la nube (porque la nube ya dice que se borró). */
export function removeProgressLocal(examId: string, slot: string, store: Store | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(keyOf(examId, slot));
    const last = readJson(store, lastKey()) as { examId?: string; slot?: string } | null;
    if (last?.examId === examId && last?.slot === slot) store.removeItem(lastKey());
  } catch {
    /* nada */
  }
}

/** Todos los avances válidos de este usuario guardados en el dispositivo. */
export function listProgressLocal(now: number = Date.now(), store: Store | null = defaultStore()): SavedProgress[] {
  const st = store as Partial<Storage> | null;
  if (!st || typeof st.length !== 'number' || !st.key) return [];
  const prefix = `${PREFIX}${userId}:`;
  const out: SavedProgress[] = [];
  for (let i = 0; i < st.length; i++) {
    const k = st.key(i);
    if (!k || !k.startsWith(prefix) || k === lastKey()) continue;
    const p = readJson(store!, k) as Partial<SavedProgress> | null;
    if (p && typeof p.examId === 'string' && typeof p.slot === 'string' && isValid(p, p.examId, p.slot, now)) out.push(p);
  }
  return out;
}

export function loadProgress(
  examId: string,
  slot: string,
  now: number = Date.now(),
  store: Store | null = defaultStore(),
): SavedProgress | null {
  if (!store) return null;
  const p = readJson(store, keyOf(examId, slot));
  if (p === null) return null;
  if (isValid(p, examId, slot, now)) return p;
  try {
    store.removeItem(keyOf(examId, slot)); // dañado o vencido
  } catch {
    /* nada */
  }
  return null;
}

export function clearProgress(examId: string, slot: string, store: Store | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(keyOf(examId, slot));
    const last = readJson(store, lastKey()) as { examId?: string; slot?: string } | null;
    if (last?.examId === examId && last?.slot === slot) store.removeItem(lastKey());
  } catch {
    /* nada */
  }
  notify({ kind: 'clear', examId, slot });
}

/** La última sesión que se estaba haciendo: al recargar /practice/<simulacro> se continúa esa. */
export function lastSlotFor(examId: string, store: Store | null = defaultStore()): string | null {
  if (!store) return null;
  const last = readJson(store, lastKey()) as { examId?: string; slot?: string } | null;
  return last?.examId === examId && typeof last.slot === 'string' ? last.slot : null;
}

/** Marca qué sesión continuar al abrir /practice/<simulacro> (lo usan los botones "Continuar"). */
export function setLastSlot(examId: string, slot: string, store: Store | null = defaultStore()): void {
  if (!store) return;
  try {
    store.setItem(lastKey(), JSON.stringify({ examId, slot }));
  } catch {
    /* nada */
  }
}

/** Avance pendiente de un slot (null si no hay o ya está todo respondido). Para mostrar "Continuar (5 de 20)". */
export function pendingProgress(
  examId: string,
  slot: string,
  now: number = Date.now(),
  store: Store | null = defaultStore(),
): { done: number; total: number } | null {
  const p = loadProgress(examId, slot, now, store);
  if (!p || p.results.length >= p.questionIds.length) return null;
  return { done: p.results.length, total: p.questionIds.length };
}
