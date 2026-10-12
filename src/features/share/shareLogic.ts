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
