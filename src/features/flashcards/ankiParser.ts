import he from 'he';

/*
 * Lector de colecciones de Anki (collection.anki2 / collection.anki21).
 *
 * Por qué no basta con leer `notes.flds`: una nota de Anki puede tener muchos campos (por ejemplo
 * "Número", "Pregunta", "Respuesta") y es la PLANTILLA del tipo de nota la que decide cuál es el
 * frente y cuál el reverso. Además una misma nota puede generar varias tarjetas (reversas, cloze).
 * Por eso aquí se recorren las tarjetas (`cards`) y se renderiza su plantilla, como hace Anki.
 */

/** Lo mínimo que usamos de sql.js (así el parser se puede probar sin navegador). */
export interface SqlDb {
  exec(sql: string): { columns: string[]; values: unknown[][] }[];
}

/** Datos de programación que Anki guarda por tarjeta. */
export interface RawSched {
  type: number; // 0 nueva, 1 aprendiendo, 2 repaso, 3 reaprendiendo
  queue: number;
  due: number; // nuevas: posición; repaso: días desde la creación de la colección
  ivl: number; // intervalo en días (negativo = segundos, en aprendizaje)
  factor: number; // facilidad en milésimas (2500 = 2.5)
  reps: number;
  lapses: number;
}

export interface AnkiCard {
  deck: string;
  front: string;
  back: string;
  /** Nombres de archivo tal como aparecen en el HTML (o URL http/https). */
  frontImage: string | null;
  backImage: string | null;
  frontAudio: string | null;
  backAudio: string | null;
  sched: RawSched;
}

export interface AnkiCollection {
  cards: AnkiCard[];
  /** Momento de creación de la colección (segundos Unix); sirve para fechar los repasos. */
  crt: number;
  /** Tarjetas descartadas por tener el frente vacío. */
  skipped: number;
  /** Imágenes/audios sobrantes (solo se guarda 1 imagen y 1 audio por lado). */
  extraMedia: number;
}

interface AnkiModel {
  name: string;
  type: number; // 0 estándar, 1 cloze
  flds: { name: string; ord: number }[];
  tmpls: { name: string; ord: number; qfmt: string; afmt: string }[];
}

/* ───────────── HTML → texto y multimedia ───────────── */

export function htmlToText(html: string): string {
  const s = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<(?:div|p|tr|h[1-6])\b[^>]*>/gi, '\n') // cada bloque empieza en línea nueva
    .replace(/<[^>]+>/g, '');
  return he
    .decode(s)
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const IMG_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const SOUND_RE = /\[sound:([^\]]+)\]/g;

function cleanName(raw: string): string {
  const decoded = he.decode(raw.trim());
  try {
    return decodeURIComponent(decoded);
  } catch {
    return decoded;
  }
}

// Algunos mazos ponen el audio como etiqueta HTML en vez de [sound:...]
const AUDIO_TAG_RE = /<(?:audio|source)\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

export function extractMedia(html: string): { images: string[]; audios: string[] } {
  const images: string[] = [];
  const audios: string[] = [];
  for (const m of html.matchAll(IMG_RE)) images.push(cleanName(m[1] ?? m[2] ?? m[3] ?? ''));
  for (const m of html.matchAll(SOUND_RE)) audios.push(cleanName(m[1]));
  for (const m of html.matchAll(AUDIO_TAG_RE)) audios.push(cleanName(m[1] ?? m[2] ?? m[3] ?? ''));
  return { images: images.filter(Boolean), audios: audios.filter(Boolean) };
}

/* ───────────── Plantillas de Anki ───────────── */

// Anki considera "vacío" un campo con solo espacios o etiquetas <br>/<div>.
const EMPTY_FIELD_RE = /^(?:\s|<\/?(?:br|div)\s?\/?>)*$/i;
const fieldIsEmpty = (v: string) => EMPTY_FIELD_RE.test(v);

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/** Cloze: en la pregunta se oculta el hueco n; en la respuesta se muestra. */
export function renderCloze(text: string, n: number, question: boolean): string {
  return text.replace(CLOZE_RE, (_m, num: string, answer: string, hint?: string) =>
    Number(num) === n && question ? `[${hint || '...'}]` : answer,
  );
}

interface RenderCtx {
  fields: Record<string, string>;
  frontSide: string;
  question: boolean;
  cloze: number;
  tags: string;
  deck: string;
  cardName: string;
  modelName: string;
}

function applyConditionals(tpl: string, fields: Record<string, string>): string {
  let out = tpl;
  for (let i = 0; i < 10; i++) {
    const next = out.replace(
      /\{\{([#^])\s*([^{}]+?)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g,
      (_m, kind: string, name: string, inner: string) => ((kind === '#') === !fieldIsEmpty(fields[name] ?? '') ? inner : ''),
    );
    if (next === out) break;
    out = next;
  }
  return out;
}

export function renderTemplate(tpl: string, ctx: RenderCtx): string {
  return applyConditionals(tpl, ctx.fields).replace(/\{\{([^{}#^/][^{}]*?)\}\}/g, (_m, raw: string) => {
    const parts = raw.split(':').map((p) => p.trim());
    const name = parts[parts.length - 1];
    const filters = parts.slice(0, -1).reverse(); // Anki aplica los filtros de derecha a izquierda

    let value: string;
    switch (name) {
      case 'FrontSide':
        return ctx.frontSide;
      case 'Tags':
        return ctx.tags;
      case 'Deck':
        return ctx.deck;
      case 'Subdeck':
        return ctx.deck.split('::').pop() ?? ctx.deck;
      case 'Card':
        return ctx.cardName;
      case 'Type':
        return ctx.modelName;
      default:
        value = ctx.fields[name] ?? '';
    }

    for (const f of filters) {
      switch (f.toLowerCase()) {
        case 'cloze':
          value = renderCloze(value, ctx.cloze, ctx.question);
          break;
        case 'text':
          value = htmlToText(value);
          break;
        case 'hint':
          return ''; // en Anki es un enlace "mostrar pista"
        case 'type':
          // "Escribe la respuesta": en la pregunta no se muestra; en la respuesta, el texto correcto.
          if (ctx.question) return '';
          break;
        default:
          break; // filtros desconocidos (furigana, etc.): se deja el valor tal cual
      }
    }
    return value;
  });
}

const FRONT_MARK = '\u0000FRONT\u0000';
const ANSWER_HR_RE = /<hr[^>]*\bid\s*=\s*["']?answer["']?[^>]*>/i;

/** Renderiza una tarjeta: devuelve el HTML del frente y el del reverso (sin repetir el frente). */
export function renderCardHtml(
  model: AnkiModel,
  ord: number,
  fields: Record<string, string>,
  extra: { tags: string; deck: string },
): { frontHtml: string; backHtml: string } {
  const tmpl = (model.type === 1 ? model.tmpls[0] : model.tmpls.find((t) => t.ord === ord)) ?? model.tmpls[0];
  const base = {
    fields,
    cloze: ord + 1,
    tags: extra.tags,
    deck: extra.deck,
    cardName: tmpl?.name ?? '',
    modelName: model.name,
  };
  const frontHtml = renderTemplate(tmpl?.qfmt ?? '', { ...base, frontSide: '', question: true });

  const answer = renderTemplate(tmpl?.afmt ?? '', { ...base, frontSide: FRONT_MARK, question: false });
  const pieces = answer.split(ANSWER_HR_RE);
  const afterHr = pieces.length > 1 ? pieces.slice(1).join('') : '';
  const backHtml = (afterHr.trim() ? afterHr : answer).split(FRONT_MARK).join('');
  return { frontHtml, backHtml };
}

/* ───────────── Colección ───────────── */

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

function parseJson<T>(text: unknown): T | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function readAnkiCollection(db: SqlDb): AnkiCollection {
  const colRes = db.exec('SELECT crt, models, decks FROM col LIMIT 1');
  if (!colRes.length || !colRes[0].values.length) throw new Error('El archivo no contiene una colección de Anki válida.');
  const [crt, modelsJson, decksJson] = colRes[0].values[0];

  const models = parseJson<Record<string, AnkiModel>>(modelsJson);
  const decks = parseJson<Record<string, { name: string }>>(decksJson) ?? {};
  if (!models) {
    throw new Error(
      'Esta colección usa un formato de Anki que no se puede leer. Expórtala marcando "Soporte para versiones anteriores de Anki".',
    );
  }

  const res = db.exec(
    `SELECT c.ord, CASE WHEN c.odid != 0 THEN c.odid ELSE c.did END AS did, c.type, c.queue, c.due, c.ivl,
            c.factor, c.reps, c.lapses, n.mid, n.flds, n.tags
     FROM cards c JOIN notes n ON n.id = c.nid
     ORDER BY did, c.due, c.ord`,
  );
  const rows = res[0]?.values ?? [];
  if (!rows.length) throw new Error('No se encontraron fichas dentro del archivo.');

  const cards: AnkiCard[] = [];
  let skipped = 0;
  let extraMedia = 0;

  for (const r of rows) {
    const [ord, did, type, queue, due, ivl, factor, reps, lapses, mid, flds, tags] = r;
    const model = models[String(mid)];
    const values = String(flds ?? '').split('\x1f');
    const deck = decks[String(did)]?.name ?? 'Importado';

    let frontHtml: string;
    let backHtml: string;
    if (model && model.tmpls?.length) {
      const fields: Record<string, string> = {};
      model.flds.forEach((f) => (fields[f.name] = values[f.ord] ?? ''));
      ({ frontHtml, backHtml } = renderCardHtml(model, num(ord), fields, { tags: String(tags ?? '').trim(), deck }));
    } else {
      // Tipo de nota desconocido (colección dañada): mejor esfuerzo con los dos primeros campos.
      frontHtml = values[0] ?? '';
      backHtml = values[1] ?? '';
    }

    const front = extractMedia(frontHtml);
    const back = extractMedia(backHtml);
    extraMedia += Math.max(0, front.images.length - 1) + Math.max(0, front.audios.length - 1);
    extraMedia += Math.max(0, back.images.length - 1) + Math.max(0, back.audios.length - 1);

    const frontText = htmlToText(frontHtml);
    if (!frontText && !front.images.length && !front.audios.length) {
      skipped++;
      continue;
    }

    cards.push({
      deck,
      front: frontText,
      back: htmlToText(backHtml),
      frontImage: front.images[0] ?? null,
      backImage: back.images[0] ?? null,
      frontAudio: front.audios[0] ?? null,
      backAudio: back.audios[0] ?? null,
      sched: {
        type: num(type),
        queue: num(queue),
        due: num(due),
        ivl: num(ivl),
        factor: num(factor),
        reps: num(reps),
        lapses: num(lapses),
      },
    });
  }

  if (!cards.length) throw new Error('No se pudo leer ninguna ficha con contenido en este mazo.');
  return { cards, crt: num(crt), skipped, extraMedia };
}

/* ───────────── Archivos multimedia dentro del .apkg ───────────── */

const normName = (s: string) => s.normalize('NFC');

/** Índice nombre-original → nombre-del-archivo-en-el-zip, a partir del archivo `media` (JSON). */
export function buildMediaIndex(mediaJson: string | null): Map<string, string> {
  const index = new Map<string, string>();
  const map = parseJson<Record<string, string>>(mediaJson);
  if (!map) return index;
  for (const [zipKey, original] of Object.entries(map)) index.set(normName(original), zipKey);
  return index;
}

export const lookupMedia = (index: Map<string, string>, name: string) => index.get(normName(name)) ?? null;
