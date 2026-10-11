import { norm, toBool } from './text';

export type QType =
  | 'multiple_choice'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  // Del importador JSON: ordenar palabras y transformar una oración (se contesta escribiendo, como short_answer)
  | 'order_words'
  | 'transform';

export interface ParsedQuestion {
  type: QType;
  prompt: string;
  options: { id: string; text: string }[] | null;
  answer: Record<string, unknown> | null;
  explanation?: string;
  imagen_url?: string | null;
  confidence: number; // 0..1  (< 0.6 → candidato a fallback IA)
  warnings: string[];
  raw: string;
}

const RE = {
  qStart: /^\s*(?:(?:pregunta|question)\s*\d*\s*[:.\-]\s*|\d{1,3}\s*[.)\-]\s+)/i,
  option: /^\s*\(?([A-Ha-h])[.)\]:\-]\s+(.+)$/,
  inlineOptions: /^\s*(?:opciones|options)\s*:\s*(.+)$/i,
  answer: /^\s*(?:respuesta(?:\s+correcta)?|correcta|answer|clave)\s*[:=\-]\s*(.+)$/i,
  // El texto puede venir en la misma línea o en las siguientes ("Explicación:" solo en su línea)
  explanation: /^\s*(?:explicaci[oó]n|justificaci[oó]n|retroalimentaci[oó]n)\s*[:\-]\s*(.*)$/i,
  tf: /^\s*(verdadero|falso|true|false|v|f)\s*[.)]?\s*$/i,
  blank: /_{3,}|\[\s*\.{0,3}\s*\]|\{\{[^}]*\}\}/,
};

/** 1. Limpia ruido típico de texto copiado de PDF */
export function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/\*\*/g, '') // negritas markdown (no tocamos "___": son huecos)
    .replace(/^\s*(?:p[áa]gina|page)\s*\d+.*$/gim, '') // "Página 3"
    .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '') // números de página sueltos
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * ¿La línea `i` empieza una pregunta nueva?
 * Dentro de una explicación, "1. …" puede ser un punto de la lista de la explicación y no la pregunta siguiente:
 * solo cuenta como pregunta nueva si dice "Pregunta…" o si lo que sigue trae opciones, respuesta o huecos.
 */
function startsQuestion(lines: string[], i: number, inExplanation: boolean): boolean {
  if (!RE.qStart.test(lines[i])) return false;
  if (!inExplanation || /^\s*(?:pregunta|question)\b/i.test(lines[i]) || RE.blank.test(lines[i])) return true;
  for (let j = i + 1; j < lines.length && !RE.qStart.test(lines[j]); j++) {
    const l = lines[j];
    if (RE.option.test(l) || RE.inlineOptions.test(l) || RE.answer.test(l) || RE.tf.test(l) || RE.blank.test(l)) return true;
  }
  return false;
}

/** 2. Divide en bloques (uno por pregunta) */
function splitBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[][] = [];
  let cur: string[] = [];
  let inExplanation = false;
  for (const [i, line] of lines.entries()) {
    if (startsQuestion(lines, i, inExplanation) && cur.some((l) => l.trim())) {
      blocks.push(cur);
      cur = [];
      inExplanation = false;
    }
    if (RE.explanation.test(line)) inExplanation = true;
    cur.push(line);
  }
  if (cur.some((l) => l.trim())) blocks.push(cur);

  // Sin marcadores de pregunta: separar por líneas en blanco
  if (blocks.length <= 1 && /\n\s*\n/.test(text)) {
    return text
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
  }
  return blocks.map((b) => b.join('\n').trim()).filter(Boolean);
}

/** 3. Parsea un bloque */
function parseBlock(raw: string): ParsedQuestion {
  const warnings: string[] = [];
  const lines = raw
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());

  const prompt: string[] = [];
  const options: { id: string; text: string }[] = [];
  let inline: string[] | null = null;
  let answerRaw = '';
  let explanation = '';
  let tfLine: boolean | null = null;
  let section: 'prompt' | 'option' | 'answer' | 'explanation' = 'prompt';

  for (const [i, line] of lines.entries()) {
    const l = i === 0 ? line.replace(RE.qStart, '') : line;
    let m: RegExpMatchArray | null;

    if (i > 0 && (m = l.match(RE.answer))) {
      answerRaw = m[1].trim();
      section = 'answer';
    } else if ((m = l.match(RE.explanation))) {
      explanation = m[1].trim();
      section = 'explanation';
    } else if ((m = l.match(RE.inlineOptions))) {
      inline = m[1]
        .split(/\s*[|;]\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      section = 'option';
    } else if (i > 0 && section !== 'explanation' && (m = l.match(RE.option))) {
      // (dentro de la explicación, una línea tipo "A. diferencia…" es texto de la explicación, no una opción)
      options.push({ id: m[1].toLowerCase(), text: m[2].trim() });
      section = 'option';
    } else if (i > 0 && section !== 'explanation' && !options.length && !inline && tfLine === null && (m = l.match(RE.tf))) {
      tfLine = toBool(m[1]); // línea suelta "Verdadero" / "Falso"
    } else if (section === 'prompt') {
      prompt.push(l.trim());
    } else if (section === 'option' && options.length) {
      options[options.length - 1].text += ' ' + l.trim(); // opción en varias líneas
    } else if (section === 'answer') {
      answerRaw += ' ' + l.trim();
    } else if (section === 'explanation') {
      explanation += ' ' + l.trim();
    }
  }

  const opts = options.length
    ? options
    : (inline ?? []).map((t, k) => ({ id: String.fromCharCode(97 + k), text: t }));

  let text = prompt.join(' ').trim();
  let confidence = 1;
  let type: QType;
  let answer: ParsedQuestion['answer'] = null;

  if (!text) {
    warnings.push('Pregunta sin enunciado');
    confidence -= 0.5;
  }

  if (opts.length >= 2) {
    // ── Opción múltiple ─────────────────────────────────────────────
    type = 'multiple_choice';
    const compact = answerRaw
      .trim()
      .toLowerCase()
      .replace(/\s+y\s+|\s+and\s+/g, ',')
      .replace(/[\s,/&;]+/g, ',')
      .replace(/[.)]$/, '');
    let ids: string[] = [];
    if (/^[a-h](,[a-h])*$/.test(compact)) {
      ids = [...new Set(compact.split(','))]; // "B" o "B, D"
    } else if (answerRaw) {
      const target = norm(answerRaw.replace(/^[a-h][.)]\s*/i, '')); // "París" o "B) París"
      const hit = opts.find((o) => norm(o.text) === target);
      if (hit) ids = [hit.id];
    }
    ids = ids.filter((id) => opts.some((o) => o.id === id));
    if (!ids.length) {
      warnings.push('No se pudo determinar la respuesta correcta');
      confidence -= 0.5;
    }
    answer = { correct: ids };
  } else if (RE.blank.test(text)) {
    // ── Completar espacios ──────────────────────────────────────────
    type = 'fill_blank';
    let n = 0;
    text = text.replace(new RegExp(RE.blank, 'g'), () => `{{${++n}}}`);
    let parts = answerRaw.split(/\s*[;|]\s*/).filter(Boolean);
    if (parts.length < n && n > 1) parts = answerRaw.split(/\s*,\s*/).filter(Boolean);
    const blanks = parts.map((p) => p.split(/\s*\/\s*/).filter(Boolean)); // "París/Paris" = alternativas
    if (blanks.length !== n) {
      warnings.push(`Hay ${n} espacio(s) y ${blanks.length} respuesta(s)`);
      confidence -= 0.4;
    }
    answer = { blanks };
  } else if (tfLine !== null || toBool(answerRaw) !== null) {
    // ── Verdadero / Falso ───────────────────────────────────────────
    type = 'true_false';
    answer = { value: toBool(answerRaw) ?? tfLine };
  } else {
    // ── Respuesta corta ─────────────────────────────────────────────
    type = 'short_answer';
    if (answerRaw) {
      answer = { accepted: answerRaw.split(/\s*\|\s*/).filter(Boolean) };
    } else {
      warnings.push('No se encontró respuesta; ¿formato libre?');
      confidence -= 0.6;
    }
  }

  return {
    type,
    prompt: text,
    options: type === 'multiple_choice' ? opts : null,
    answer,
    explanation: explanation.trim() || undefined,
    confidence: Math.max(0, confidence),
    warnings,
    raw,
  };
}

export function parseQuestions(input: string): ParsedQuestion[] {
  return splitBlocks(normalize(input)).map(parseBlock);
}
