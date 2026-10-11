import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
  currentProgressUser,
  listProgressLocal,
  removeProgressLocal,
  setProgressListener,
  writeProgressLocal,
  type SavedProgress,
} from './progress';

/*
 * Copia el avance a Supabase para poder continuar en otro dispositivo (web ↔ APK).
 * Lo local sigue siendo lo principal (rápido y funciona sin internet): la nube es una copia que se sincroniza
 * al iniciar sesión, al volver a la app y al abrir un simulacro. Gana siempre el cambio más reciente.
 * Terminar o reiniciar una sesión deja una fila con data = null, así los demás dispositivos también la descartan.
 */

export interface RemoteRow {
  exam_id: string;
  slot: string;
  saved_at: number;
  data: SavedProgress | null;
}

export type SyncAction =
  | { kind: 'pull'; p: SavedProgress }
  | { kind: 'drop'; examId: string; slot: string }
  | { kind: 'push'; p: SavedProgress };

const id = (examId: string, slot: string) => `${examId}\u0000${slot}`;

/** Decide qué hacer comparando lo local con lo de la nube (la versión más reciente gana). */
export function planSync(local: SavedProgress[], remote: RemoteRow[]): SyncAction[] {
  const actions: SyncAction[] = [];
  const rmap = new Map(remote.map((r) => [id(r.exam_id, r.slot), r]));
  const seen = new Set<string>();

  for (const l of local) {
    const k = id(l.examId, l.slot);
    seen.add(k);
    const r = rmap.get(k);
    if (!r || l.savedAt > Number(r.saved_at)) actions.push({ kind: 'push', p: l });
    else if (Number(r.saved_at) > l.savedAt) {
      actions.push(r.data ? { kind: 'pull', p: r.data } : { kind: 'drop', examId: l.examId, slot: l.slot });
    }
  }
  for (const r of remote) {
    if (seen.has(id(r.exam_id, r.slot)) || !r.data) continue; // solo local borrado / nada que traer
    actions.push({ kind: 'pull', p: r.data });
  }
  return actions;
}

// Avisa a las pantallas que el avance guardado cambió (llegó algo de la nube)
export const useProgressVersion = create<{ version: number; bump: () => void }>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

// Las operaciones con la nube van en fila para que un "borrar" nunca se adelante a un "guardar"
let chain: Promise<unknown> = Promise.resolve();
const enqueue = <T>(fn: () => Promise<T>): Promise<T | undefined> => {
  const next = chain.then(fn, fn).catch(() => undefined) as Promise<T | undefined>;
  chain = next;
  return next;
};

const cloudUser = () => {
  const u = currentProgressUser();
  return u === 'anon' ? null : u;
};

async function upsertRow(userId: string, examId: string, slot: string, savedAt: number, data: SavedProgress | null) {
  const { error } = await supabase
    .from('practice_progress')
    .upsert({ user_id: userId, exam_id: examId, slot, saved_at: savedAt, data }, { onConflict: 'user_id,exam_id,slot' });
  if (error) throw error;
}

/** Sincroniza ahora: baja lo más nuevo de la nube y sube lo local que esté más nuevo. Nunca lanza errores. */
export function syncProgress(): Promise<boolean | undefined> {
  const userId = cloudUser();
  if (!userId) return Promise.resolve(false);
  return enqueue(async () => {
    const { data, error } = await supabase.from('practice_progress').select('exam_id,slot,saved_at,data');
    if (error) throw error; // sin la tabla (falta correr el SQL) o sin internet: se sigue solo con lo local
    const actions = planSync(listProgressLocal(), (data ?? []) as RemoteRow[]);
    let changed = false;
    for (const a of actions) {
      if (a.kind === 'push') await upsertRow(userId, a.p.examId, a.p.slot, a.p.savedAt, a.p).catch(() => undefined);
      else if (a.kind === 'pull') {
        writeProgressLocal(a.p);
        changed = true;
      } else {
        removeProgressLocal(a.examId, a.slot);
        changed = true;
      }
    }
    if (changed) useProgressVersion.getState().bump();
    return changed;
  });
}

let started = false;
/** Empieza a copiar a la nube cada avance que se guarda o se borra en el dispositivo. */
export function startProgressSync() {
  if (started) return;
  started = true;
  setProgressListener((e) => {
    const userId = cloudUser();
    if (!userId) return;
    void enqueue(() =>
      e.kind === 'save'
        ? upsertRow(userId, e.p.examId, e.p.slot, e.p.savedAt, e.p)
        : upsertRow(userId, e.examId, e.slot, Date.now(), null),
    );
  });
}
