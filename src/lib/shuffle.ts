import type { Question } from './grading';

/*
 * Mezclar las opciones de las preguntas de selección múltiple al practicar.
 *
 * Solo cambia lo que se VE: cada opción conserva su id ("a", "b"…) y `answer.correct` sigue apuntando a esos ids,
 * así que la calificación, el historial y la base de datos no se enteran. Lo único que cambia es el orden en
 * pantalla y, por tanto, la letra que se muestra (se calcula por posición, ver `letterOf`).
 *
 * Una pregunta NO se mezcla si su sentido depende del orden: "todas las anteriores", "A y B", "[IMAGEN A]"…
 * ni si su explicación nombra letras de una forma que no se puede reescribir con seguridad.
 */

const KEY = 'sp:shuffle-options';

/** Preferencia del usuario (por defecto activada). */
export const loadShuffleOptions = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
};
export const saveShuffleOptions = (on: boolean): void => {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* sin almacenamiento: la preferencia vale solo para esta sesión */
  }
};

/** Letra que se muestra para la opción en la posición `i` (0 → A). */
export const letterOf = (i: number): string => String.fromCharCode(65 + i);

// Generador pseudoaleatorio con semilla (mulberry32): misma semilla, mismo orden.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Opciones cuyo significado depende de su lugar o de otras opciones
const ORDER_DEPENDENT = [
  /(?:todas|todos|ninguna|ninguno|ambas|ambos)\s+(?:de\s+)?(?:las|los|estas|estos)?\s*(?:anteriores|opciones|alternativas|afirmaciones)/i,
  /\banteriores\b/i, // "las anteriores", "ninguna de las anteriores"
  /^\s*(?:ambas|ambos|las\s+dos|los\s+dos)\b/i, // "Ambas son correctas"
  /\b(?:opci[oó]n|opciones|alternativas?|literal(?:es)?|incisos?)\s+[A-H]\b/i, // "la opción A y la B son correctas"
  /^\s*(?:s[oó]lo\s+|solo\s+)?[A-H](?:\s*(?:,|y|e)\s*[A-H])*\.?\s*$/i, // "A y B", "Solo C", "D"
  /\[IMAGEN(?:\s+[A-H])?\]/i,
];

// Cómo la explicación nombra una opción por su letra: "La opción A…", "Las opciones A y C…"
const KEYWORD = '(?:[Oo]pci(?:ón|on)(?:es)?|[Aa]lternativas?|[Ll]iterales?|[Ii]ncisos?)';
const REF = new RegExp(`(\\b${KEYWORD}\\s+)([A-H](?:\\s*(?:,|y|e|o)\\s*[A-H])*)(?![\\p{L}\\d])`, 'gu');
// Formas que NO sabemos reescribir: mejor no mezclar esa pregunta que mostrar una explicación equivocada
const UNSAFE_EXPLANATION = [
  new RegExp(`\\b${KEYWORD}\\s+[a-h](?![\\p{L}\\d])`, 'u'), // "opción a" en minúscula
  /(?:^|[\s(])[A-H]\)/, // "A) …", "(B)"
  /\b(?:[Rr]espuesta(?:\s+correcta)?|[Cc]lave|[Rr]ta\.?)\s*[:\-]?\s*\(?[A-H]\)?(?![\p{L}\d])/u, // "Respuesta correcta: B"
];

/** ¿Se puede mezclar esta pregunta sin cambiar su sentido? */
export function canShuffle(q: Question): boolean {
  if (q.type !== 'multiple_choice' || !q.options || q.options.length < 2) return false;
  if (q.options.some((o) => ORDER_DEPENDENT.some((re) => re.test(o.text)))) return false;
  if (q.explanation && UNSAFE_EXPLANATION.some((re) => re.test(q.explanation!))) return false;
  return true;
}

/** Cambia las letras que nombra la explicación ("la opción A") por las que ahora se ven en pantalla. */
export function remapLetters(text: string, toNew: Map<string, string>): string {
  return text.replace(REF, (_m, lead: string, letters: string) => lead + letters.replace(/[A-H]/g, (L) => toNew.get(L) ?? L));
}

/**
 * Devuelve la pregunta con las opciones en otro orden (y la explicación con las letras ya ajustadas).
 * Con la misma semilla siempre sale el mismo orden. Si la pregunta no se puede mezclar, devuelve la misma.
 */
export function shuffleQuestion(q: Question, seed: number): Question {
  if (!canShuffle(q)) return q;
  const opts = [...q.options!];
  const rand = rng(seed);
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  // letra original (A, B…) → letra que se ve ahora
  const toNew = new Map<string, string>();
  opts.forEach((o, i) => toNew.set(o.id.toUpperCase(), letterOf(i)));
  return { ...q, options: opts, explanation: q.explanation ? remapLetters(q.explanation, toNew) : q.explanation };
}
