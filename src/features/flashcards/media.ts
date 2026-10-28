// Una ficha puede tener varios audios por lado (p. ej. palabra, definición y ejemplo).
// Se guardan en la misma columna (audio_ref / back_audio_ref) separados por saltos de línea,
// así no hace falta cambiar la base de datos y las fichas viejas (con un solo audio) siguen igual.

const SEP = '\n';

/** "gd:a\ngd:b" → ["gd:a", "gd:b"]. Acepta null y fichas con un solo audio. */
export function splitRefs(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ["gd:a", null, "gd:b"] → "gd:a\ngd:b" (o null si no queda ninguno). Quita repetidos. */
export function joinRefs(refs: (string | null | undefined)[]): string | null {
  const clean = [...new Set(refs.filter((r): r is string => !!r && !!r.trim()).map((r) => r.trim()))];
  return clean.length ? clean.join(SEP) : null;
}

/* ───────────── Texto de la ficha ───────────── */

export type LineKind = 'title' | 'phonetic' | 'short' | 'long' | 'example';

export interface CardLine {
  kind: LineKind;
  text: string;
}

// Etiquetas de plantilla que quedaron sin contenido: "Word:", "Meaning:", "Ejemplo:"…
const EMPTY_LABEL_RE = /^[\p{L}\s]{1,25}:$/u;
// Pronunciación: [əˈprəʊtʃ] o /əˈprəʊtʃ/
const PHONETIC_RE = /^(\[[^\]]+\]|\/[^/]+\/)$/;

/**
 * Convierte el texto plano del reverso en líneas con un tipo, para darles estilos distintos:
 * la primera línea corta es el título, la pronunciación va aparte, y "definición → ejemplo"
 * se separa en dos líneas.
 */
export function formatCardText(text: string): CardLine[] {
  const raw = text
    .split('\n')
    .flatMap((line) => {
      // "To approach something means… → The boy approached his school."
      const parts = line.split(/\s*→\s*/);
      return parts.map((p, i) => ({ text: p.trim(), example: i > 0 }));
    })
    .filter((l) => l.text && !EMPTY_LABEL_RE.test(l.text));

  const out: CardLine[] = [];
  raw.forEach((l, i) => {
    let kind: LineKind;
    if (l.example) kind = 'example';
    else if (PHONETIC_RE.test(l.text)) kind = 'phonetic';
    else if (i === 0 && l.text.length <= 40) kind = 'title';
    else if (l.text.length <= 40) kind = 'short';
    else kind = 'long';
    out.push({ kind, text: l.text });
  });
  return out;
}
