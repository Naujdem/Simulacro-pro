import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { buildMediaIndex, htmlToText, lookupMedia, readAnkiCollection, renderCloze } from './ankiParser';
import { scheduleImportedCards } from './ankiSchedule';

// Colección mínima con el esquema 11 de Anki (el de "Soporte para versiones anteriores").
const models = {
  '100': {
    name: 'Basic numerado',
    type: 0,
    flds: [
      { name: 'Número', ord: 0 },
      { name: 'Pregunta', ord: 1 },
      { name: 'Respuesta', ord: 2 },
    ],
    tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Pregunta}}', afmt: '{{FrontSide}}<hr id=answer>{{Respuesta}}' }],
  },
  '200': {
    name: 'Basic (and reversed)',
    type: 0,
    flds: [
      { name: 'Front', ord: 0 },
      { name: 'Back', ord: 1 },
    ],
    tmpls: [
      { name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' },
      { name: 'Card 2', ord: 1, qfmt: '{{Back}}', afmt: '{{FrontSide}}<hr id=answer>{{Front}}' },
    ],
  },
  '300': {
    name: 'Cloze',
    type: 1,
    flds: [
      { name: 'Text', ord: 0 },
      { name: 'Extra', ord: 1 },
    ],
    tmpls: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Extra}}' }],
  },
};
const decks = { '1': { name: 'Default' }, '10': { name: 'Química::Estequiometría' }, '20': { name: 'Biología' } };

const CRT = Math.floor(new Date('2026-01-01T00:00:00').getTime() / 1000);

let db: ReturnType<typeof makeDb>;
let SQL: any;

function makeDb() {
  const d = new SQL.Database();
  d.run('CREATE TABLE col (crt integer, models text, decks text)');
  d.run('CREATE TABLE notes (id integer, mid integer, flds text, tags text)');
  d.run(
    'CREATE TABLE cards (id integer, nid integer, did integer, odid integer, ord integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer)',
  );
  d.run('INSERT INTO col VALUES (?,?,?)', [CRT, JSON.stringify(models), JSON.stringify(decks)]);

  const note = (id: number, mid: number, flds: string[]) =>
    d.run('INSERT INTO notes VALUES (?,?,?,?)', [id, mid, flds.join('\x1f'), ' tag1 ']);
  const card = (id: number, nid: number, did: number, ord: number, type: number, due: number, ivl = 0, factor = 0, reps = 0, lapses = 0) =>
    d.run('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [id, nid, did, 0, ord, type, type === 2 ? 2 : 0, due, ivl, factor, reps, lapses]);

  // El primer campo es un número (1000, 999, …): NO es ni el frente ni el reverso.
  note(1, 100, ['1000', '¿Qué es la molaridad?', 'Moles de soluto por litro <img src="mol%20es.png">[sound:molar.mp3]']);
  card(1, 1, 10, 0, 0, 1);
  note(2, 100, ['999', '¿Qué es la molalidad?', 'Moles por kg de solvente']);
  card(2, 2, 10, 0, 0, 2);
  // Nota con reversa → 2 tarjetas
  note(3, 200, ['ATP', 'Moneda de energía']);
  card(3, 3, 20, 0, 0, 3);
  card(4, 3, 20, 1, 0, 4);
  // Cloze con dos huecos → 2 tarjetas
  note(4, 300, ['La {{c1::mitocondria}} produce {{c2::ATP::molécula}}', 'Orgánulo']);
  card(5, 4, 20, 0, 0, 5);
  card(6, 4, 20, 1, 0, 6);
  // Tarjeta ya estudiada: intervalo 30 días, vence 10 días después de la creación + 40 (queda en el pasado/futuro lejano)
  note(5, 200, ['Repaso', 'Estudiada']);
  card(7, 5, 20, 0, 2, 9000, 30, 2300, 12, 2);
  return d;
}

beforeAll(async () => {
  SQL = await initSqlJs();
  db = makeDb();
});

describe('readAnkiCollection', () => {
  it('usa la plantilla del mazo y no el primer campo (problema de los números 1000, 999…)', () => {
    const { cards } = readAnkiCollection(db);
    const mol = cards.find((c) => c.front.includes('molaridad'))!;
    expect(mol.front).toBe('¿Qué es la molaridad?');
    expect(mol.back).toBe('Moles de soluto por litro');
    expect(cards.some((c) => c.front === '1000' || c.front === '999')).toBe(false);
  });

  it('extrae imagen y audio del lado donde están, decodificando el nombre', () => {
    const mol = readAnkiCollection(db).cards.find((c) => c.front.includes('molaridad'))!;
    expect(mol.frontImage).toBeNull();
    expect(mol.backImage).toBe('mol es.png');
    expect(mol.backAudio).toBe('molar.mp3');
  });

  it('asigna el mazo de cada tarjeta, con su jerarquía', () => {
    const { cards } = readAnkiCollection(db);
    expect(new Set(cards.map((c) => c.deck))).toEqual(new Set(['Química::Estequiometría', 'Biología']));
    expect(cards.find((c) => c.front.includes('molaridad'))!.deck).toBe('Química::Estequiometría');
  });

  it('genera una tarjeta por cada plantilla (reversas) y por cada hueco (cloze)', () => {
    const { cards } = readAnkiCollection(db);
    const atp = cards.filter((c) => c.front === 'ATP' || c.front === 'Moneda de energía');
    expect(atp.map((c) => [c.front, c.back])).toEqual([
      ['ATP', 'Moneda de energía'],
      ['Moneda de energía', 'ATP'],
    ]);
    const cloze = cards.filter((c) => c.front.includes('produce') || c.front.includes('La '));
    expect(cloze.map((c) => c.front)).toEqual(['La [...] produce ATP', 'La mitocondria produce [molécula]']);
    expect(cloze[0].back).toBe('La mitocondria produce ATP\nOrgánulo');
  });

  it('conserva los datos de programación de Anki', () => {
    const studied = readAnkiCollection(db).cards.find((c) => c.front === 'Repaso')!;
    expect(studied.sched).toMatchObject({ type: 2, ivl: 30, factor: 2300, reps: 12, lapses: 2 });
  });
});

describe('scheduleImportedCards', () => {
  const now = new Date('2026-10-09T15:00:00');
  const mk = (n: number, deck = 'A') =>
    Array.from({ length: n }, () => ({
      deck,
      sched: { type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0 },
    }));

  it('reparte las nuevas: 20 por día, no las 1000 de golpe', () => {
    const out = scheduleImportedCards(mk(1000), { crt: CRT, newPerDay: 20, keepProgress: true, now });
    const day = (d: Date) => Math.round((d.getTime() - new Date('2026-10-09T00:00:00').getTime()) / 86_400_000);
    expect(out.filter((s) => day(s.dueAt) === 0)).toHaveLength(20);
    expect(out.filter((s) => day(s.dueAt) === 1)).toHaveLength(20);
    expect(day(out[999].dueAt)).toBe(49);
    expect(out.every((s) => s.intervalDays === 0 && s.repetitions === 0 && s.easeFactor === 2.5)).toBe(true);
  });

  it('cada mazo lleva su propio ritmo', () => {
    const out = scheduleImportedCards([...mk(30, 'A'), ...mk(30, 'B')], { crt: CRT, newPerDay: 20, keepProgress: true, now });
    const today = new Date('2026-10-09T00:00:00').getTime();
    expect(out.filter((s) => s.dueAt.getTime() === today)).toHaveLength(40); // 20 de A + 20 de B
  });

  it('respeta el progreso de Anki en las tarjetas ya estudiadas', () => {
    const studied = readAnkiCollection(db).cards.find((c) => c.front === 'Repaso')!;
    const [s] = scheduleImportedCards([studied], { crt: CRT, newPerDay: 20, keepProgress: true, now });
    expect(s.intervalDays).toBe(30);
    expect(s.easeFactor).toBe(2.3);
    expect(s.repetitions).toBe(10);
    // vence 9000 días después de la creación (en el futuro lejano)
    expect(s.dueAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it('con keepProgress=false todo se trata como nuevo', () => {
    const studied = readAnkiCollection(db).cards.find((c) => c.front === 'Repaso')!;
    const [s] = scheduleImportedCards([studied], { crt: CRT, newPerDay: 20, keepProgress: false, now });
    expect(s).toMatchObject({ intervalDays: 0, repetitions: 0, easeFactor: 2.5 });
  });
});

describe('utilidades', () => {
  it('htmlToText conserva saltos de línea y decodifica entidades', () => {
    expect(htmlToText('Hola<br>mundo &amp; <b>más</b><div>otra</div>[sound:a.mp3]')).toBe('Hola\nmundo & más\notra');
  });

  it('renderCloze oculta solo el hueco pedido', () => {
    expect(renderCloze('{{c1::A}} y {{c2::B::pista}}', 2, true)).toBe('A y [pista]');
    expect(renderCloze('{{c1::A}} y {{c2::B::pista}}', 2, false)).toBe('A y B');
  });

  it('encuentra los archivos multimedia aunque cambie la normalización Unicode (é)', () => {
    const index = buildMediaIndex(JSON.stringify({ '0': 'canción.mp3'.normalize('NFD') }));
    expect(lookupMedia(index, 'canción.mp3'.normalize('NFC'))).toBe('0');
    expect(lookupMedia(index, 'otro.mp3')).toBeNull();
  });
});
