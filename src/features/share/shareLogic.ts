// Lógica pura de compartir/copiar simulacros (sin pantalla ni base de datos, para poder probarla).

/** Aviso cuando hay más archivos que esto. */
export const MANY_FILES = 20;
export const MANY_FILES_MSG = 'Este simulacro tiene muchos archivos. La copia puede tardar varios minutos.';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // sin letras que se confunden (l, o, 0, 1)

/** Código corto del enlace (8 caracteres). `rand` devuelve un entero aleatorio de 0 a n-1. */
export function makeShortId(rand: (n: number) => number = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n, length = 8): string {
  let s = '';
  for (let i = 0; i < length; i++) s += ALPHABET[rand(ALPHABET.length)];
  return s;
}

export const shareUrl = (base: string, shortId: string) => `${base.replace(/\/+$/, '')}/s/${shortId}`;

/** Referencias gd:<id> de imágenes y audios de las preguntas, sin repetir y en orden de aparición. */
export function collectMediaRefs(rows: { imagen_url?: string | null; audio_url?: string | null }[]): string[] {
  const out = new Set<string>();
  for (const r of rows) for (const ref of [r.imagen_url, r.audio_url]) if (typeof ref === 'string' && ref.startsWith('gd:')) out.add(ref);
  return [...out];
}

export interface CopyOutcome {
  /** { "gd:viejo": "gd:nuevo" } solo de los archivos que sí se copiaron. */
  map: Record<string, string>;
  total: number;
  copied: number;
  failed: string[];
}

/**
 * Copia cada archivo con `copyFile` (de a pocos a la vez). Si uno falla se salta y se sigue con los demás.
 * `onProgress(hechos, total)` se llama cada vez que termina uno (con o sin éxito).
 */
export async function copyAllMedia(
  refs: string[],
  copyFile: (ref: string) => Promise<string>,
  onProgress?: (done: number, total: number) => void,
  concurrency = 3,
): Promise<CopyOutcome> {
  const map: Record<string, string> = {};
  const failed: string[] = [];
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < refs.length) {
      const ref = refs[next++];
      try {
        map[ref] = await copyFile(ref);
      } catch {
        failed.push(ref);
      }
      onProgress?.(++done, refs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, refs.length) }, worker));
  return { map, total: refs.length, copied: refs.length - failed.length, failed };
}

/** Mensaje final de la copia (éxito total, parcial o sin archivos). */
export function copyMessage(o: CopyOutcome): { text: string; warn: boolean } {
  if (!o.total) return { text: '¡Listo! El simulacro se guardó en tu cuenta.', warn: false };
  if (!o.failed.length) return { text: `¡Listo! El simulacro se guardó en tu cuenta. Se copiaron ${o.copied} de ${o.total} archivos.`, warn: false };
  return {
    text: `El simulacro se guardó, pero no se pudieron copiar algunos archivos. Se copiaron ${o.copied} de ${o.total} archivos.`,
    warn: true,
  };
}

/* ───────────── Bibliotecas compartidas ───────────── */

/** Enlace público de una biblioteca: /b/<código> (los de simulacros son /s/<código>). */
export const folderShareUrl = (base: string, shortId: string) => `${base.replace(/\/+$/, '')}/b/${shortId}`;

/** Subbiblioteca dentro de una biblioteca compartida. La biblioteca raíz del enlace no aparece en la lista. */
export interface SharedFolderNode {
  id: string;
  parent_id: string | null;
  name: string;
  color?: string | null;
  description?: string | null;
}

/** Datos de portada de un simulacro dentro de una biblioteca compartida (sin preguntas). */
export interface SharedFolderExamRow {
  id: string;
  folder_id: string | null;
  title: string;
  description: string | null;
  subject: string | null;
  question_count: number;
  time_limit_min: number | null;
}

/** Ids de una biblioteca y de todas sus subbibliotecas, a cualquier nivel (corta si hubiera un ciclo). */
export function treeIds(folders: { id: string; parent_id?: string | null }[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Lo que se ve al abrir una carpeta: sus subbibliotecas y los simulacros que están directamente en ella. */
export function folderContents(folders: SharedFolderNode[], exams: SharedFolderExamRow[], currentId: string) {
  return {
    folders: folders.filter((f) => f.parent_id === currentId),
    exams: exams.filter((e) => e.folder_id === currentId),
  };
}

/** Cuántos simulacros hay en una carpeta contando todas sus subbibliotecas. */
export function countExamsIn(folders: SharedFolderNode[], exams: SharedFolderExamRow[], id: string): number {
  const ids = treeIds(folders, id);
  return exams.filter((e) => e.folder_id && ids.has(e.folder_id)).length;
}

/** Camino desde la primera subbiblioteca hasta `id` (incluida), para las migas de pan. Vacío si `id` es la raíz. */
export function folderTrail(folders: SharedFolderNode[], id: string): SharedFolderNode[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const trail: SharedFolderNode[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    trail.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return trail;
}

/** Mensaje final de guardar una biblioteca completa (éxito total, parcial o sin archivos). */
export function copyFolderMessage(o: CopyOutcome, examCount: number): { text: string; warn: boolean } {
  const what = examCount === 1 ? 'La biblioteca (1 simulacro) se guardó en tu cuenta.' : `La biblioteca (${examCount} simulacros) se guardó en tu cuenta.`;
  if (!o.total) return { text: `¡Listo! ${what}`, warn: false };
  if (!o.failed.length) return { text: `¡Listo! ${what} Se copiaron ${o.copied} de ${o.total} archivos.`, warn: false };
  return { text: `${what} Pero no se pudieron copiar algunos archivos: se copiaron ${o.copied} de ${o.total}.`, warn: true };
}
