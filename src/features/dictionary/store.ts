import { StarDict, type DictHit } from './stardict';
import type { ImportedDict } from './importer';

/*
 * Los diccionarios instalados viven en este dispositivo (IndexedDB): no se suben a Supabase y se usan sin conexión.
 * Cada dispositivo (celular, PWA) tiene los suyos.
 */

const DB = 'simulapro-dictionaries';
const STORE = 'dicts';

interface Stored extends ImportedDict {
  id: string;
  /** Orden de consulta: primero el de menor número. */
  order: number;
}

export interface InstalledDict {
  id: string;
  name: string;
  wordCount: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Este navegador no permite guardar diccionarios.'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('No se pudo abrir el almacenamiento de diccionarios.'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'No hay espacio suficiente en el dispositivo.' : 'No se pudo guardar el diccionario.'));
      tx.onabort = tx.onerror;
    });
  } finally {
    db.close();
  }
}

// Diccionarios ya abiertos en esta sesión (armar el índice de uno grande tarda un poco: se hace una sola vez).
let loaded: Promise<{ id: string; name: string; sd: StarDict }[]> | null = null;
const listeners = new Set<() => void>();
const changed = () => {
  loaded = null;
  listeners.forEach((l) => l());
};
/** Avisa cuando se instala, quita o reordena un diccionario. Devuelve la función para dejar de escuchar. */
export function onDictionariesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function listDictionaries(): Promise<InstalledDict[]> {
  const all = await run<Stored[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => a.order - b.order).map(({ id, name, wordCount }) => ({ id, name, wordCount }));
}

export async function saveDictionary(d: ImportedDict): Promise<void> {
  const existing = await run<Stored[]>('readonly', (s) => s.getAll());
  const id = d.name.toLowerCase().replace(/\s+/g, ' ').trim();
  const prev = existing.find((e) => e.id === id);
  const order = prev ? prev.order : existing.reduce((m, e) => Math.max(m, e.order), -1) + 1;
  await run('readwrite', (s) => s.put({ ...d, id, order } satisfies Stored));
  changed();
}

export async function removeDictionary(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
  changed();
}

/** Sube (-1) o baja (+1) un diccionario en el orden de consulta. */
export async function moveDictionary(id: string, dir: -1 | 1): Promise<void> {
  const all = (await run<Stored[]>('readonly', (s) => s.getAll())).sort((a, b) => a.order - b.order);
  const i = all.findIndex((d) => d.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      all.forEach((d, n) => tx.objectStore(STORE).put({ ...d, order: n }));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('No se pudo cambiar el orden.'));
    });
  } finally {
    db.close();
  }
  changed();
}

function openAll() {
  if (!loaded) {
    loaded = run<Stored[]>('readonly', (s) => s.getAll()).then((all) =>
      all
        .sort((a, b) => a.order - b.order)
        .map((d) => ({ id: d.id, name: d.name, sd: new StarDict({ ifo: d.ifo, idx: d.idx, dict: d.dict, syn: d.syn }) })),
    );
    loaded.catch(() => (loaded = null));
  }
  return loaded;
}

export interface LocalResult {
  dictionary: string;
  hits: DictHit[];
}

/** Busca la palabra en todos los diccionarios instalados (en su orden). Vacío si no hay ninguno o ninguno la tiene. */
export async function lookupLocal(word: string): Promise<LocalResult[]> {
  const dicts = await openAll();
  return dicts.map((d) => ({ dictionary: d.name, hits: d.sd.lookup(word) })).filter((r) => r.hits.length > 0);
}

/** Pide al navegador que no borre los diccionarios al liberar espacio. No es crítico si falla. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* nada */
  }
}
