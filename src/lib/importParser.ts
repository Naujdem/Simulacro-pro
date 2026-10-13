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
  answer: /^\s*(?:respuesta(?:\s+correcta)?|rta|resp|correcta|answer|clave)\.?\s*[:=\-]\s*(.+)$/i,
  // El texto puede venir en la misma línea o en las siguientes ("Explicación:" solo en su línea)
  explanation: /^\s*(?:explicaci[oó]n|justificaci[oó]n|retroalimentaci[oó]n)\s*[:\-]\s*(.*)$/i,
  tf: /^\s*(verdadero|falso|true|false|v|f)\s*[.)]?\s*$/i,
  blank: /_{3,}|\[\s*\.{0,3}\s*\]|\{\{[^}]*\}\}/,
};

/** 1. Limpia ruido típico de texto copiado de PDF */
export function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^[ \t]*(?:```|~~~)[^\n]*$/gm, '') // cercas de código al pegar desde un chat/markdown
    .replace(/ /g, ' ')
    .replace(/\*\*/g, '') // negritas markdown (no tocamos "___": son huecos)
    .replace(/^\s*(?:p[áa]gina|page)\s*\d+.*$/gim, '') // "Página 3"
    .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '') // números de página sueltos
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Número con el que arranca una línea de pregunta ("109.", "Pregunta 5:"); null si no lleva número */
function leadingNumber(line: string): number | null {
  const m = line.match(/^\s*(?:(?:pregunta|question)\s*)?(\d{1,3})\b/i);
  return m ? Number(m[1]) : null;
}

/** ¿Lo que sigue a la línea `i` (hasta el próximo marcador numerado) trae opciones, respuesta, V/F o huecos? */
function hasBodyAfter(lines: string[], i: number): boolean {
  for (let j = i + 1; j < lines.length && !RE.qStart.test(lines[j]); j++) {
    const l = lines[j];
    if (RE.option.test(l) || RE.inlineOptions.test(l) || RE.answer.test(l) || RE.tf.test(l) || RE.blank.test(l)) return true;
  }
  return false;
}

/**
 * 2. Divide en bloques (uno por pregunta).
 *
 * Una línea "N. …" puede ser una pregunta nueva o un ítem de una lista numerada que forma parte del enunciado
 * (o de la explicación). Se decide según en qué parte de la pregunta en curso estamos:
 *  - ya hubo opciones, respuesta o V/F ("body") → la pregunta anterior terminó: es una pregunta nueva;
 *  - "Pregunta…" explícito → pregunta nueva;
 *  - todavía en el enunciado ("prompt"): si el número continúa la lista que ya empezó, es un ítem; si es el número
 *    de la pregunta + 1, es una pregunta nueva; si no, lo que decide es si después vienen opciones/respuesta;
 *  - dentro de la explicación → solo es pregunta nueva si lo que sigue trae opciones, respuesta o huecos.
 */
function splitBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[][] = [];
  let cur: string[] = [];
  let phase: 'prompt' | 'body' | 'explanation' = 'prompt';
  let preamble = true; // aún no apareció el primer marcador de pregunta
  let qNum: number | null = null; // número de la pregunta en curso
  let listNext: number | null = null; // siguiente número esperado si el enunciado trae una lista numerada
  let markers = 0;

  for (const [i, line] of lines.entries()) {
    if (RE.qStart.test(line)) {
      const n = leadingNumber(line);
      const explicit = /^\s*(?:pregunta|question)\b/i.test(line);
      let isNew: boolean;
      if (preamble || phase === 'body' || explicit) isNew = true;
      else if (phase === 'explanation') isNew = RE.blank.test(line) || hasBodyAfter(lines, i);
      else if (listNext !== null && n === listNext) isNew = false; // sigue la lista del enunciado
      else if (qNum !== null && n === qNum + 1) isNew = true; // numeración consecutiva
      else isNew = RE.blank.test(line) || hasBodyAfter(lines, i);

      if (isNew) {
        if (cur.some((l) => l.trim())) blocks.push(cur);
        cur = [];
        phase = 'prompt';
        preamble = false;
        qNum = n;
        listNext = null;
        markers++;
      } else if (phase === 'prompt') {
        listNext = (n ?? 0) + 1;
      }
    }
    if (RE.explanation.test(line)) phase = 'explanation';
    else if (
      phase === 'prompt' &&
      (RE.answer.test(line) || RE.option.test(line) || RE.inlineOptions.test(line) || (cur.length > 0 && RE.tf.test(line)))
    )
      phase = 'body';
    cur.push(line);
  }
  if (cur.some((l) => l.trim())) blocks.push(cur);

  // Sin ningún marcador de pregunta: separar por líneas en blanco
  if (markers === 0 && /\n\s*\n/.test(text)) {
    return text
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
  }
  return blocks.map((b) => b.join('\n').trim()).filter(Boolean);
}

/** "A) Madrid B) París C) Roma" en una sola línea → [['a','Madrid'], ['b','París'], …]; null si no tiene ese formato */
function splitInlineOptions(line: string): [string, string][] | null {
  const s = line.trim();
  const marks = [...s.matchAll(/(?:^|\s)\(?([A-Ha-h])[.)\]:\-]\s+/g)];
  if (marks.length < 2 || marks[0].index !== 0) return null;
  const ids = marks.map((m) => m[1].toLowerCase());
  // Las letras deben ser consecutivas (a, b, c…): evita partir textos como "plan A. y plan B."
  if (!ids.every((id, k) => k === 0 || id.charCodeAt(0) === ids[k - 1].charCodeAt(0) + 1)) return null;
  const out: [string, string][] = [];
  for (const [k, m] of marks.entries()) {
    const start = (m.index ?? 0) + m[0].length;
    const end = k + 1 < marks.length ? (marks[k + 1].index ?? s.length) : s.length;
    const text = s.slice(start, end).trim();
    if (!text) return null;
    out.push([ids[k], text]);
  }
  return out;
}

/** 3. Parsea un bloque */
function parseBlock(raw: string): ParsedQuestion {
  const warnings: string[] = [];
  const lines = raw
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());

  let promptText = ''; // los ítems de una lista numerada del enunciado van cada uno en su línea
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
      const found: [string, string][] = splitInlineOptions(l) ?? [[m[1].toLowerCase(), m[2].trim()]];
      for (const [id, optText] of found) {
        if (options.some((o) => o.id === id)) {
          // La letra se repite: lo anterior era una lista "a) b) c)" del enunciado, no las opciones
          for (const o of options) promptText += `\n${o.id}) ${o.text}`;
          options.length = 0;
        }
        options.push({ id, text: optText });
      }
      section = 'option';
    } else if (i > 0 && section !== 'explanation' && !options.length && !inline && tfLine === null && (m = l.match(RE.tf))) {
      tfLine = toBool(m[1]); // línea suelta "Verdadero" / "Falso"
    } else if (section === 'prompt') {
      const t = l.trim();
      // lista numerada o con romanos ("I. …", "II. …") → una línea por ítem
      promptText += !promptText ? t : RE.qStart.test(t) || /^[IVX]{1,4}[.)]\s/.test(t) ? '\n' + t : ' ' + t;
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

  let text = promptText.trim();
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
