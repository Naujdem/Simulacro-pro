/*
 * Lecturas con palabras tocables: separa el texto en palabras (que se pueden tocar) y todo lo demás
 * (espacios, puntuación, números), y encuentra la frase donde aparece cada palabra.
 */

export interface Piece {
  text: string;
  /** true si es una palabra tocable. */
  word: boolean;
  /** Posición donde empieza dentro del texto original. */
  start: number;
}

// Letras (con tildes) y, dentro de la palabra, apóstrofos y guiones: don't, mother-in-law
const WORD = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;

export function splitWords(text: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    const start = m.index!;
    if (start > last) out.push({ text: text.slice(last, start), word: false, start: last });
    out.push({ text: m[0], word: true, start });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), word: false, start: last });
  return out;
}

/** Forma para comparar y guardar: minúsculas y apóstrofo normal ("Don’t" → "don't"). */
export const normalizeWord = (w: string): string => w.replace(/’/g, "'").toLowerCase();

const END = /[.!?\n]/;

/** La frase del texto que contiene la posición `index` (sin saltos de línea ni espacios de más). */
export function sentenceAt(text: string, index: number): string {
  let start = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (END.test(text[i])) {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = index; i < text.length; i++) {
    if (END.test(text[i])) {
      end = text[i] === '\n' ? i : i + 1;
      break;
    }
  }
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}
