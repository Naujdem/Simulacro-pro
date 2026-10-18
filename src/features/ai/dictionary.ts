import { normalizeWord } from '@/lib/readingWords';

/*
 * Diccionario inglés sin IA (como el de KOReader): definiciones, fonética, audio y ejemplos desde la API gratuita
 * https://dictionaryapi.dev (sin clave, permite llamadas desde el navegador y desde el APK).
 * Funciona aunque OpenRouter y Gemini estén caídos o sin saldo.
 */

export interface DictMeaning {
  /** noun, verb, adjective… */
  pos: string;
  definitions: { text: string; example?: string }[];
}

export interface DictEntry {
  word: string;
  /** Pronunciación escrita, ej. "/ˈnaʊ.ə.deɪz/". */
  phonetic?: string;
  /** URL de un audio de pronunciación. */
  audio?: string;
  meanings: DictMeaning[];
}

interface RawEntry {
  word?: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: { partOfSpeech?: string; definitions?: { definition?: string; example?: string }[] }[];
}

const MAX_MEANINGS = 4;
const MAX_DEFS = 3;

/** Convierte la respuesta de la API en algo corto y fácil de mostrar. Devuelve null si no trae definiciones. */
export function parseEntries(raw: unknown): DictEntry | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const entries = raw as RawEntry[];
  const phonetics = entries.flatMap((e) => e.phonetics ?? []);
  const phonetic = entries.find((e) => e.phonetic)?.phonetic ?? phonetics.find((p) => p.text)?.text;
  const audio = phonetics.find((p) => p.audio)?.audio;

  // Une las categorías repetidas entre entradas (la API a veces separa "noun" en varias)
  const byPos = new Map<string, DictMeaning>();
  for (const e of entries) {
    for (const m of e.meanings ?? []) {
      const pos = (m.partOfSpeech ?? '').trim();
      const defs = (m.definitions ?? [])
        .filter((d) => d.definition?.trim())
        .map((d) => ({ text: d.definition!.trim(), example: d.example?.trim() || undefined }));
      if (!defs.length) continue;
      const cur = byPos.get(pos) ?? { pos, definitions: [] };
      cur.definitions.push(...defs);
      byPos.set(pos, cur);
    }
  }
  const meanings = [...byPos.values()]
    .slice(0, MAX_MEANINGS)
    .map((m) => ({ ...m, definitions: m.definitions.slice(0, MAX_DEFS) }));
  if (!meanings.length) return null;
  return { word: entries[0].word ?? '', phonetic: phonetic || undefined, audio: audio ? audio.replace(/^\/\//, 'https://') : undefined, meanings };
}

/** Formas base a probar si la palabra tal cual no está (plurales, -ed, -ing…): "played" → "play". */
export function baseForms(word: string): string[] {
  // Frase o phrasal verb: la forma base está en el primer verbo ("picked up" → "pick up", "gives up" → "give up")
  const sp = normalizeWord(word).trim().split(/\s+/);
  if (sp.length > 1) return baseForms(sp[0]).map((f) => [f, ...sp.slice(1)].join(' '));
  const w = normalizeWord(word).replace(/'s$/, '');
  const out = new Set<string>([w]);
  const add = (s: string) => s.length >= 2 && out.add(s);
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
    if (/(.)\1ed$/.test(w)) add(w.slice(0, -3));
  }
  if (w.endsWith('ing')) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + 'e');
    if (/(.)\1ing$/.test(w)) add(w.slice(0, -4));
  }
  if (w.endsWith('ly')) add(w.slice(0, -2));
  return [...out];
}

// Búsquedas de esta sesión (incluidas las que van en camino): tocar otra vez la misma palabra no repite la petición.
const cache = new Map<string, Promise<DictEntry | null>>();

async function fetchOne(word: string): Promise<DictEntry | null> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (res.status === 404) return null; // "No Definitions Found"
  if (!res.ok) throw new Error(`El diccionario respondió con error ${res.status}.`);
  return parseEntries(await res.json());
}

/** Busca la palabra en el diccionario; si no aparece, prueba su forma base. null = no hay definición. Lanza error si no hay conexión. */
export function lookupWord(word: string): Promise<DictEntry | null> {
  const key = normalizeWord(word);
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      for (const form of baseForms(word)) {
        const entry = await fetchOne(form);
        if (entry) return entry;
      }
      return null;
    })();
    cache.set(key, p);
    p.catch(() => cache.delete(key)); // un fallo de red no se guarda: al volver a tocar se reintenta
  }
  return p;
}
