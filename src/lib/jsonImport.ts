import { norm } from './text';

/*
 * Importador JSON: el usuario genera el JSON por fuera (ChatGPT / Claude) y lo pega en la app.
 * Este módulo solo valida y convierte; no toca la base de datos (eso lo hace jsonImportApi.ts).
 * Los mensajes de error dicen DÓNDE está el problema ("Biblioteca 1 › Simulacro 2 › Pregunta 4: …").
 */

export type ImportQType = 'multiple_choice' | 'true_false' | 'fill_blank' | 'order_words' | 'transform';
export const IMPORT_TYPES: ImportQType[] = ['multiple_choice', 'true_false', 'fill_blank', 'order_words', 'transform'];
export const TRANSFORM_FORMS = ['afirmativa', 'negativa', 'interrogativa'] as const;

export const DEFAULT_COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#ec4899'];
export const ORDER_WORDS_PROMPT = 'Ordena las palabras para formar la oración';

export interface PlanQuestion {
  type: ImportQType;
  prompt: string;
  options: { id: string; text: string }[] | null;
  answer: Record<string, unknown>;
  explanation: string | null;
  /** Índice de la lectura (dentro del simulacro) a la que pertenece, o null si es una pregunta suelta. */
  readingIndex: number | null;
}
export interface PlanReading {
  title: string;
  body: string;
}
export interface PlanExam {
  title: string;
  subject: string | null;
  description: string | null;
  /** Orden dentro de su biblioteca (0, 1, 2…). */
  position: number;
  readings: PlanReading[];
  questions: PlanQuestion[];
}
export interface PlanFolder {
  name: string;
  color: string;
  description: string | null;
  exams: PlanExam[];
}
export interface PlanCard {
  front: string;
  back: string;
  deck: string | null;
}
export interface ImportPlan {
  folders: PlanFolder[];
  looseExams: PlanExam[];
  cards: PlanCard[];
}

export interface ImportSummary {
  folders: number;
  exams: number;
  questions: number;
  readings: number;
  cards: number;
  decks: number;
  byType: Record<ImportQType, number>;
}

export type ParseResult =
  | { ok: true; plan: ImportPlan; summary: ImportSummary; warnings: string[] }
  | { ok: false; errors: string[] };

const MAX_ERRORS = 25;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);
const optStr = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);
const shown = (x: unknown) => {
  const s = JSON.stringify(x);
  return s && s.length > 40 ? s.slice(0, 40) + '…' : s ?? String(x);
};

/** Quita lo que suelen añadir los chats: ```json … ```, texto antes y después del JSON, comillas "inteligentes". */
export function cleanJsonText(raw: string): string {
  let t = raw.replace(/^﻿/, '').trim();
  const fence = t.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.search(/[{[]/);
  const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a > 0 || (b >= 0 && b < t.length - 1)) t = t.slice(Math.max(a, 0), b >= 0 ? b + 1 : undefined);
  return t;
}

/** Convierte el error de JSON.parse en un mensaje con línea y columna. */
function jsonSyntaxMessage(text: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/position (\d+)/i);
  const lc = msg.match(/line (\d+) column (\d+)/i);
  let where = '';
  if (lc) where = ` (línea ${lc[1]}, columna ${lc[2]})`;
  else if (m) {
    const pos = Number(m[1]);
    const before = text.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    where = ` (línea ${line}, columna ${col})`;
  }
  const hint = /Unexpected token|Expected|Unterminated|Bad control/i.test(msg)
    ? ' Revisa comas de más o de menos, comillas sin cerrar o textos sin comillas.'
    : '';
  return `El texto no es un JSON válido${where}.${hint}`;
}

class Ctx {
  errors: string[] = [];
  warnings: string[] = [];
  err(path: string, msg: string) {
    if (this.errors.length < MAX_ERRORS) this.errors.push(`${path}: ${msg}`);
    else if (this.errors.length === MAX_ERRORS) this.errors.push('… y más errores (corrige estos primero).');
  }
  warn(path: string, msg: string) {
    this.warnings.push(`${path}: ${msg}`);
  }
}

const tokens = (s: string) => s.split(/\s+/).map((w) => norm(w)).filter(Boolean);

function validateQuestion(raw: unknown, path: string, readingIndex: number | null, c: Ctx): PlanQuestion | null {
  if (!isObj(raw)) {
    c.err(path, 'debe ser un objeto { … }.');
    return null;
  }
  const tipo = raw.tipo;
  if (typeof tipo !== 'string' || !IMPORT_TYPES.includes(tipo as ImportQType)) {
    c.err(path, `"tipo" debe ser uno de: ${IMPORT_TYPES.join(', ')}${tipo === undefined ? ' (falta)' : ` (llegó ${shown(tipo)})`}.`);
    return null;
  }
  const type = tipo as ImportQType;
  const explanation = optStr(raw.explicacion);
  if (raw.explicacion !== undefined && raw.explicacion !== null && typeof raw.explicacion !== 'string')
    c.err(path, '"explicacion" debe ser un texto.');
  const errBefore = c.errors.length;
  const prompt = str(raw.enunciado);
  const base = { type, explanation, readingIndex };

  switch (type) {
    case 'multiple_choice': {
      if (!prompt) c.err(path, 'falta "enunciado".');
      const opts = raw.opciones;
      if (!Array.isArray(opts) || opts.length < 2) {
        c.err(path, '"opciones" debe ser una lista de al menos 2 textos.');
        break;
      }
      if (opts.length > LETTERS.length) {
        c.err(path, `máximo ${LETTERS.length} opciones.`);
        break;
      }
      const texts = opts.map((o) => (typeof o === 'string' || typeof o === 'number' ? String(o).trim() : ''));
      if (texts.some((t) => !t)) {
        c.err(path, '"opciones" solo puede tener textos no vacíos.');
        break;
      }
      const cor = raw.correcta;
      const idx = Array.isArray(cor) ? cor : [cor];
      const bad = idx.find((i) => !Number.isInteger(i) || (i as number) < 0 || (i as number) >= texts.length);
      if (!idx.length || bad !== undefined || cor === undefined) {
        c.err(
          path,
          `"correcta" debe ser el número de la opción correcta empezando en 0 (con ${texts.length} opciones va de 0 a ${texts.length - 1}), o una lista como [0, 2]${
            cor === undefined ? ' (falta)' : ` (llegó ${shown(cor)})`
          }.`,
        );
        break;
      }
      if (new Set(idx).size !== idx.length) c.warn(path, '"correcta" repite números.');
      if (new Set(texts.map(norm)).size !== texts.length) c.warn(path, 'hay opciones repetidas.');
      if (c.errors.length > errBefore || !prompt) break;
      return {
        ...base,
        prompt,
        options: texts.map((text, i) => ({ id: LETTERS[i], text })),
        answer: { correct: [...new Set(idx as number[])].map((i) => LETTERS[i]) },
      };
    }

    case 'true_false': {
      if (!prompt) c.err(path, 'falta "enunciado".');
      if (typeof raw.correcta !== 'boolean') {
        c.err(path, `"correcta" debe ser true o false, sin comillas${raw.correcta === undefined ? ' (falta)' : ` (llegó ${shown(raw.correcta)})`}.`);
        break;
      }
      if (!prompt) break;
      return { ...base, prompt, options: null, answer: { value: raw.correcta } };
    }

    case 'fill_blank': {
      if (!prompt) {
        c.err(path, 'falta "enunciado".');
        break;
      }
      const slots = (prompt.match(/_{3,}/g) ?? []).length;
      if (!slots) {
        c.err(path, 'el "enunciado" debe tener ___ (tres guiones bajos) donde va cada espacio.');
        break;
      }
      let cor = raw.correcta;
      // Un solo espacio con varias formas aceptadas: ["done","did"]
      if (slots === 1 && Array.isArray(cor) && cor.length > 1 && cor.every((x) => typeof x === 'string')) cor = [cor];
      const list = typeof cor === 'string' ? [cor] : cor;
      if (!Array.isArray(list)) {
        c.err(path, '"correcta" debe ser un texto, o una lista con una respuesta por cada ___.');
        break;
      }
      if (list.length !== slots) {
        c.err(path, `el enunciado tiene ${slots} espacio(s) ___ pero "correcta" trae ${list.length} respuesta(s).`);
        break;
      }
      const blanks: string[][] = [];
      let okBlanks = true;
      list.forEach((b, i) => {
        const alts = (Array.isArray(b) ? b : [b]).map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
        if (!alts.length) {
          c.err(path, `la respuesta del espacio ${i + 1} está vacía o no es texto.`);
          okBlanks = false;
        } else blanks.push(alts);
      });
      if (!okBlanks) break;
      let n = 0;
      return { ...base, prompt: prompt.replace(/_{3,}/g, () => `{{${++n}}}`), options: null, answer: { blanks } };
    }

    case 'order_words': {
      const words = raw.palabras;
      if (!Array.isArray(words) || words.length < 2 || words.some((w) => typeof w !== 'string' || !w.trim())) {
        c.err(path, '"palabras" debe ser una lista de al menos 2 textos (las palabras desordenadas).');
        break;
      }
      const sentence = str(raw.correcta);
      if (!sentence) {
        c.err(path, '"correcta" debe ser la oración completa y ordenada.');
        break;
      }
      const have = words.map((w) => norm(w as string)).filter(Boolean).sort();
      const want = tokens(sentence).sort();
      if (have.join('|') !== want.join('|')) {
        const left = [...have];
        const missing: string[] = [];
        for (const w of want) {
          const i = left.indexOf(w);
          if (i >= 0) left.splice(i, 1);
          else missing.push(w);
        }
        c.err(
          path,
          `las "palabras" no coinciden con la oración "correcta"${missing.length ? `; faltan en palabras: ${missing.join(', ')}` : ''}${
            left.length ? `; sobran: ${left.join(', ')}` : ''
          }.`,
        );
        break;
      }
      let list = (words as string[]).map((w) => w.trim());
      if (list.map(norm).join(' ') === tokens(sentence).join(' ')) {
        c.warn(path, 'las palabras venían ya en orden; se movió la primera al final para desordenarlas.');
        list = [...list.slice(1), list[0]];
      }
      return {
        ...base,
        prompt: prompt ?? ORDER_WORDS_PROMPT,
        options: list.map((text, i) => ({ id: `w${i + 1}`, text })),
        answer: { accepted: [sentence] },
      };
    }

    case 'transform': {
      const original = str(raw.original);
      if (!original) c.err(path, 'falta "original" (la oración que hay que transformar).');
      const formRaw = typeof raw.forma === 'string' ? norm(raw.forma) : '';
      const form = TRANSFORM_FORMS.find((f) => f === formRaw);
      if (!form) c.err(path, `"forma" debe ser ${TRANSFORM_FORMS.join(', ')}${raw.forma === undefined ? ' (falta)' : ` (llegó ${shown(raw.forma)})`}.`);
      const list = Array.isArray(raw.correcta) ? raw.correcta : [raw.correcta];
      const accepted = list.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
      if (!accepted.length || accepted.length !== list.length)
        c.err(path, '"correcta" debe ser un texto (o una lista de textos aceptados).');
      if (c.errors.length > errBefore || !original || !form) break;
      return { ...base, prompt: original, options: null, answer: { accepted, form } };
    }
  }
  return null;
}

function validateQuestions(raw: unknown, path: string, readingIndex: number | null, c: Ctx): PlanQuestion[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    c.err(path, 'debe ser una lista [ … ].');
    return [];
  }
  const out: PlanQuestion[] = [];
  raw.forEach((q, i) => {
    const r = validateQuestion(q, `${path} › Pregunta ${i + 1}`, readingIndex, c);
    if (r) out.push(r);
  });
  return out;
}

function validateExam(raw: unknown, path: string, c: Ctx): { exam: PlanExam; orden: number | null } | null {
  if (!isObj(raw)) {
    c.err(path, 'debe ser un objeto { … }.');
    return null;
  }
  const title = str(raw.titulo);
  if (!title) c.err(path, 'falta "titulo".');
  const where = title ? `${path} («${title}»)` : path;
  for (const k of ['tema', 'descripcion'] as const)
    if (raw[k] !== undefined && raw[k] !== null && typeof raw[k] !== 'string') c.err(where, `"${k}" debe ser un texto.`);
  let orden: number | null = null;
  if (raw.orden !== undefined && raw.orden !== null) {
    if (typeof raw.orden === 'number' && Number.isFinite(raw.orden)) orden = raw.orden;
    else c.err(where, `"orden" debe ser un número (llegó ${shown(raw.orden)}).`);
  }

  const errStart = c.errors.length;
  const questions = validateQuestions(raw.preguntas, `${where} › preguntas`, null, c);

  const readings: PlanReading[] = [];
  if (raw.lecturas !== undefined && raw.lecturas !== null) {
    if (!Array.isArray(raw.lecturas)) c.err(where, '"lecturas" debe ser una lista [ … ].');
    else
      raw.lecturas.forEach((l, i) => {
        const lp = `${where} › Lectura ${i + 1}`;
        if (!isObj(l)) return c.err(lp, 'debe ser un objeto { … }.');
        const lt = str(l.titulo);
        const body = str(l.texto);
        if (!lt) c.err(lp, 'falta "titulo".');
        if (!body) c.err(lp, 'falta "texto".');
        const qs = validateQuestions(l.preguntas, `${lp} › preguntas`, readings.length, c);
        if (!Array.isArray(l.preguntas) || !l.preguntas.length) c.err(lp, '"preguntas" debe tener al menos 1 pregunta de comprensión.');
        if (lt && body) {
          readings.push({ title: lt, body });
          questions.push(...qs);
        }
      });
  }

  if (title && !questions.length && c.errors.length === errStart) c.err(where, 'no tiene preguntas ni lecturas.');
  if (!title) return null;
  return {
    exam: { title, subject: optStr(raw.tema), description: optStr(raw.descripcion), position: 0, readings, questions },
    orden,
  };
}

/** Ordena por "orden" (los que no lo traen, según su lugar en la lista) y numera la posición 0, 1, 2… */
function orderExams(list: { exam: PlanExam; orden: number | null }[]): PlanExam[] {
  return list
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => (a.orden ?? a.i + 1) - (b.orden ?? b.i + 1) || a.i - b.i)
    .map((x, pos) => ({ ...x.exam, position: pos }));
}

export function summarize(plan: ImportPlan): ImportSummary {
  const exams = [...plan.folders.flatMap((f) => f.exams), ...plan.looseExams];
  const byType = Object.fromEntries(IMPORT_TYPES.map((t) => [t, 0])) as Record<ImportQType, number>;
  let questions = 0;
  let readings = 0;
  for (const e of exams) {
    questions += e.questions.length;
    readings += e.readings.length;
    for (const q of e.questions) byType[q.type]++;
  }
  return {
    folders: plan.folders.length,
    exams: exams.length,
    questions,
    readings,
    cards: plan.cards.length,
    decks: new Set(plan.cards.map((c) => c.deck ?? '')).size,
    byType,
  };
}

export function parseImportJson(input: string): ParseResult {
  const text = cleanJsonText(input);
  if (!text) return { ok: false, errors: ['Pega primero el JSON en el cuadro de texto.'] };

  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (e) {
    // Los chats a veces escriben comillas “curvas”: se prueba cambiándolas por comillas normales
    try {
      root = JSON.parse(text.replace(/[“”]/g, '"'));
    } catch {
      return { ok: false, errors: [jsonSyntaxMessage(text, e)] };
    }
  }
  if (!isObj(root)) return { ok: false, errors: ['El JSON debe empezar con { … } (un objeto con "bibliotecas", "simulacros" y/o "fichas").'] };

  const c = new Ctx();
  if (root.version !== undefined && root.version !== 1) c.err('version', `solo se conoce la versión 1 (llegó ${shown(root.version)}).`);
  for (const k of Object.keys(root))
    if (!['version', 'bibliotecas', 'simulacros', 'fichas'].includes(k))
      c.warn('Raíz', `la clave "${k}" no se reconoce y se ignora (¿quisiste decir bibliotecas, simulacros o fichas?).`);
  for (const k of ['bibliotecas', 'simulacros', 'fichas'] as const)
    if (root[k] !== undefined && root[k] !== null && !Array.isArray(root[k])) c.err(k, 'debe ser una lista [ … ].');

  const folders: PlanFolder[] = [];
  if (Array.isArray(root.bibliotecas))
    root.bibliotecas.forEach((b, i) => {
      const path = `Biblioteca ${i + 1}`;
      if (!isObj(b)) return c.err(path, 'debe ser un objeto { … }.');
      const name = str(b.nombre);
      if (!name) c.err(path, 'falta "nombre".');
      const where = name ? `${path} («${name}»)` : path;
      for (const k of ['color', 'descripcion'] as const)
        if (b[k] !== undefined && b[k] !== null && typeof b[k] !== 'string') c.err(where, `"${k}" debe ser un texto.`);
      let color = optStr(b.color);
      if (color && !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color)) {
        c.warn(where, `el color ${shown(color)} no es un hex como #0ea5e9; se asignó uno automático.`);
        color = null;
      }
      if (b.simulacros !== undefined && !Array.isArray(b.simulacros)) c.err(where, '"simulacros" debe ser una lista [ … ].');
      const exams = orderExams(
        (Array.isArray(b.simulacros) ? b.simulacros : [])
          .map((s, j) => validateExam(s, `${where} › Simulacro ${j + 1}`, c))
          .filter((x): x is NonNullable<typeof x> => x !== null),
      );
      if (name) folders.push({ name, color: color ?? DEFAULT_COLORS[folders.length % DEFAULT_COLORS.length], description: optStr(b.descripcion), exams });
    });

  const looseExams = orderExams(
    (Array.isArray(root.simulacros) ? root.simulacros : [])
      .map((s, j) => validateExam(s, `Simulacro ${j + 1}`, c))
      .filter((x): x is NonNullable<typeof x> => x !== null),
  );

  const cards: PlanCard[] = [];
  if (Array.isArray(root.fichas))
    root.fichas.forEach((f, i) => {
      const path = `Ficha ${i + 1}`;
      if (!isObj(f)) return c.err(path, 'debe ser un objeto { "frente": …, "reverso": … }.');
      const front = str(f.frente);
      const back = str(f.reverso);
      if (!front) c.err(path, 'falta "frente".');
      if (!back) c.err(path, 'falta "reverso".');
      if (f.mazo !== undefined && f.mazo !== null && typeof f.mazo !== 'string') c.err(path, '"mazo" debe ser un texto.');
      if (front && back) cards.push({ front, back, deck: optStr(f.mazo) });
    });

  if (c.errors.length) return { ok: false, errors: c.errors };
  const plan: ImportPlan = { folders, looseExams, cards };
  const summary = summarize(plan);
  if (!summary.folders && !summary.exams && !summary.cards)
    return { ok: false, errors: ['No hay nada que importar: agrega "bibliotecas", "simulacros" o "fichas".'] };
  return { ok: true, plan, summary, warnings: c.warnings };
}

/** Texto del preview: "1 biblioteca, 5 simulacros, 50 preguntas…" */
export function describeSummary(s: ImportSummary): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const parts: string[] = [];
  if (s.folders) parts.push(n(s.folders, 'biblioteca', 'bibliotecas'));
  if (s.exams) parts.push(n(s.exams, 'simulacro', 'simulacros'));
  if (s.questions) parts.push(n(s.questions, 'pregunta', 'preguntas'));
  if (s.readings) parts.push(n(s.readings, 'lectura', 'lecturas'));
  if (s.cards) parts.push(n(s.cards, 'ficha', 'fichas') + (s.decks ? ` en ${n(s.decks, 'mazo', 'mazos')}` : ''));
  return parts.join(', ');
}
