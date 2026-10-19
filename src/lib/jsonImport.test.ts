import { describe, expect, it } from 'vitest';
import { cleanJsonText, describeSummary, examSections, parseImportJson } from './jsonImport';

const FULL = {
  version: 1,
  bibliotecas: [
    {
      nombre: 'Inglés B1',
      color: '#0ea5e9',
      descripcion: 'Gramática',
      simulacros: [
        {
          titulo: 'B',
          orden: 2,
          preguntas: [{ tipo: 'true_false', enunciado: 'x', correcta: true }],
        },
        {
          titulo: 'A',
          tema: 'Gramática',
          descripcion: 'd',
          orden: 1,
          preguntas: [
            { tipo: 'multiple_choice', enunciado: 'She ___ here', opciones: ['have', 'has', 'had'], correcta: 1, explicacion: 'e' },
            { tipo: 'fill_blank', enunciado: 'I have ___ it and ___ it', correcta: [['done', 'did'], 'saw'] },
            { tipo: 'order_words', palabras: ['lived', 'has', 'here', 'She'], correcta: 'She has lived here.' },
            { tipo: 'transform', original: 'She has finished.', forma: 'Negativa', correcta: 'She has not finished.' },
          ],
          lecturas: [
            {
              titulo: 'Trip',
              texto: 'Tom went to London.',
              preguntas: [{ tipo: 'multiple_choice', enunciado: 'Where?', opciones: ['Paris', 'London'], correcta: [1] }],
            },
          ],
        },
      ],
    },
  ],
  fichas: [{ frente: 'f', reverso: 'r', mazo: 'Inglés::Gramática' }, { frente: 'f2', reverso: 'r2' }],
};

const ok = (x: unknown) => {
  const r = parseImportJson(typeof x === 'string' ? x : JSON.stringify(x));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r;
};
const errs = (x: unknown) => {
  const r = parseImportJson(typeof x === 'string' ? x : JSON.stringify(x));
  if (r.ok) throw new Error('debía fallar');
  return r.errors;
};
const oneQ = (q: object) => ({ simulacros: [{ titulo: 'T', preguntas: [q] }] });

describe('parseImportJson: caso completo', () => {
  const r = ok(FULL);
  it('cuenta todo', () => {
    expect(r.summary).toMatchObject({ folders: 1, exams: 2, questions: 6, readings: 1, cards: 2, decks: 2 });
    expect(describeSummary(r.summary)).toBe('1 biblioteca, 2 simulacros, 6 preguntas, 1 lectura, 2 fichas en 2 mazos');
  });
  it('ordena los simulacros por "orden"', () => {
    expect(r.plan.folders[0].exams.map((e) => [e.title, e.position])).toEqual([['A', 0], ['B', 1]]);
  });
  it('convierte al formato de la base de datos', () => {
    const [mc, fb, ow, tr, rd] = r.plan.folders[0].exams[0].questions;
    expect(mc).toMatchObject({ type: 'multiple_choice', options: [{ id: 'a', text: 'have' }, { id: 'b', text: 'has' }, { id: 'c', text: 'had' }], answer: { correct: ['b'] }, explanation: 'e' });
    expect(fb).toMatchObject({ prompt: 'I have {{1}} it and {{2}} it', answer: { blanks: [['done', 'did'], ['saw']] } });
    expect(ow.type).toBe('order_words');
    expect(ow.options!.map((o) => o.text).sort()).toEqual(['She', 'has', 'here', 'lived']);
    expect(ow.answer).toEqual({ accepted: ['She has lived here.'] });
    expect(tr).toMatchObject({ prompt: 'She has finished.', answer: { accepted: ['She has not finished.'], form: 'negativa' } });
    expect(rd).toMatchObject({ readingIndex: 0, answer: { correct: ['b'] } });
    expect(r.plan.folders[0].exams[0].readings).toEqual([{ title: 'Trip', body: 'Tom went to London.', section: 'General' }]);
  });
  it('fichas: mazo opcional', () => {
    expect(r.plan.cards).toEqual([{ front: 'f', back: 'r', deck: 'Inglés::Gramática' }, { front: 'f2', back: 'r2', deck: null }]);
  });
});

describe('parseImportJson: entrada del chat', () => {
  it('acepta ```json …``` y texto alrededor', () => {
    const t = 'Claro, aquí está:\n```json\n' + JSON.stringify(oneQ({ tipo: 'true_false', enunciado: 'x', correcta: false })) + '\n```\nEspero que sirva.';
    expect(ok(t).summary.questions).toBe(1);
  });
  it('acepta comillas curvas como delimitadores', () => {
    expect(ok('{“simulacros”:[{“titulo”:“T”,“preguntas”:[{“tipo”:“true_false”,“enunciado”:“x”,“correcta”:true}]}]}').summary.exams).toBe(1);
  });
  it('JSON roto: dice línea y columna', () => {
    const e = errs('{\n "simulacros": [\n  {"titulo": "T",}\n ]\n}');
    expect(e[0]).toMatch(/no es un JSON válido/);
    expect(e[0]).toMatch(/línea 3/);
  });
  it('vacío o sin contenido', () => {
    expect(errs('   ')[0]).toMatch(/Pega primero/);
    expect(errs({ version: 1 })[0]).toMatch(/nada que importar/);
    expect(errs('[1,2]')[0]).toMatch(/debe empezar con/);
  });
  it('cleanJsonText deja el JSON intacto', () => {
    expect(cleanJsonText('{"a":1}')).toBe('{"a":1}');
  });
});

describe('parseImportJson: errores con ubicación', () => {
  it('tipo desconocido', () => {
    const e = errs(oneQ({ tipo: 'essay', enunciado: 'x' }));
    expect(e[0]).toMatch(/Simulacro 1 \(«T»\) › preguntas › Pregunta 1: "tipo" debe ser uno de: multiple_choice/);
  });
  it('multiple_choice: índice fuera de rango y texto en vez de número', () => {
    expect(errs(oneQ({ tipo: 'multiple_choice', enunciado: 'x', opciones: ['a', 'b'], correcta: 2 }))[0]).toMatch(/empezando en 0.*0 a 1/);
    expect(errs(oneQ({ tipo: 'multiple_choice', enunciado: 'x', opciones: ['a', 'b'], correcta: 'B' }))[0]).toMatch(/llegó "B"/);
    expect(errs(oneQ({ tipo: 'multiple_choice', enunciado: 'x', opciones: ['a'], correcta: 0 }))[0]).toMatch(/al menos 2/);
  });
  it('true_false con comillas', () => {
    expect(errs(oneQ({ tipo: 'true_false', enunciado: 'x', correcta: 'true' }))[0]).toMatch(/true o false, sin comillas/);
  });
  it('fill_blank: sin ___ y cantidad distinta de respuestas', () => {
    expect(errs(oneQ({ tipo: 'fill_blank', enunciado: 'sin hueco', correcta: 'a' }))[0]).toMatch(/___/);
    expect(errs(oneQ({ tipo: 'fill_blank', enunciado: 'a ___ b ___', correcta: 'a' }))[0]).toMatch(/2 espacio.*1 respuesta/);
  });
  it('fill_blank: un hueco con alternativas planas', () => {
    expect(ok(oneQ({ tipo: 'fill_blank', enunciado: 'I ___ it', correcta: ['saw', 'seen'] })).plan.looseExams[0].questions[0].answer).toEqual({ blanks: [['saw', 'seen']] });
  });
  it('order_words: palabras que no coinciden', () => {
    const e = errs(oneQ({ tipo: 'order_words', palabras: ['She', 'has', 'lived'], correcta: 'She has lived here' }));
    expect(e[0]).toMatch(/faltan en palabras: here/);
  });
  it('order_words: ya ordenadas se desordenan con aviso', () => {
    const r = ok(oneQ({ tipo: 'order_words', palabras: ['She', 'has', 'lived'], correcta: 'She has lived' }));
    expect(r.warnings.join()).toMatch(/ya en orden/);
    expect(r.plan.looseExams[0].questions[0].options!.map((o) => o.text)).toEqual(['has', 'lived', 'She']);
  });
  it('transform: forma inválida', () => {
    expect(errs(oneQ({ tipo: 'transform', original: 'a', forma: 'pasiva', correcta: 'b' }))[0]).toMatch(/afirmativa, negativa, interrogativa/);
  });
  it('lectura sin texto o sin preguntas', () => {
    const e = errs({ simulacros: [{ titulo: 'T', lecturas: [{ titulo: 'L', preguntas: [] }] }] });
    expect(e.join('\n')).toMatch(/Lectura 1: falta "texto"/);
    expect(e.join('\n')).toMatch(/al menos 1 pregunta/);
  });
  it('simulacro sin título o vacío', () => {
    expect(errs({ simulacros: [{ preguntas: [] }] })[0]).toMatch(/Simulacro 1: falta "titulo"/);
    expect(errs({ simulacros: [{ titulo: 'T' }] })[0]).toMatch(/no tiene preguntas ni lecturas/);
  });
  it('ficha incompleta y biblioteca sin nombre', () => {
    expect(errs({ fichas: [{ frente: 'a' }] })[0]).toBe('Ficha 1: falta "reverso".');
    expect(errs({ bibliotecas: [{}] })[0]).toBe('Biblioteca 1: falta "nombre".');
  });
  it('color inválido: aviso y color automático', () => {
    const r = ok({ bibliotecas: [{ nombre: 'X', color: 'azul', simulacros: [] }] });
    expect(r.warnings.join()).toMatch(/color/);
    expect(r.plan.folders[0].color).toMatch(/^#/);
  });
  it('limita la cantidad de errores mostrados', () => {
    const many = { fichas: Array.from({ length: 80 }, () => ({})) };
    expect(errs(many).length).toBeLessThanOrEqual(27);
  });
});

describe('ejemplo y guía de la pantalla', () => {
  it('el ejemplo del botón "Ver ejemplo" es válido y trae un tipo de cada uno', async () => {
    const { JSON_EXAMPLE } = await import('@/features/import/jsonPrompt');
    const r = ok(JSON_EXAMPLE);
    expect(r.summary.byType).toMatchObject({ multiple_choice: 2, true_false: 2, fill_blank: 1, order_words: 1, transform: 1 });
    expect(r.summary).toMatchObject({ folders: 1, exams: 1, readings: 1, cards: 1 });
    expect(r.warnings).toEqual([]);
    expect(examSections(r.plan.folders[0].exams[0])).toEqual(['Gramática', 'Lectura 1: A Trip to London']);
  });
});

describe('secciones ("seccion")', () => {
  const q = (extra: object = {}) => ({ tipo: 'true_false', enunciado: 'x', correcta: true, ...extra });
  const exam = (preguntas: object[], lecturas?: object[]) => ({ simulacros: [{ titulo: 'T', preguntas, lecturas }] });
  const sections = (x: unknown) => ok(x).plan.looseExams[0].questions.map((p) => p.section);

  it('sin "seccion" todo es "General"', () => {
    expect(sections(exam([q(), q()]))).toEqual(['General', 'General']);
  });
  it('acepta "seccion" en cada pregunta y la recorta', () => {
    expect(sections(exam([q({ seccion: ' Gramática ' }), q({ seccion: 'Vocabulario' })]))).toEqual(['Gramática', 'Vocabulario']);
  });
  it('las preguntas de una lectura heredan la sección de la lectura, y pueden tener la suya', () => {
    const r = ok(
      exam(
        [q({ seccion: 'Gramática' })],
        [{ titulo: 'L', texto: 't', seccion: 'Lectura 1: Tom', preguntas: [q(), q({ seccion: 'Otra' })] }],
      ),
    );
    const e = r.plan.looseExams[0];
    expect(e.readings[0].section).toBe('Lectura 1: Tom');
    expect(e.questions.map((p) => p.section)).toEqual(['Gramática', 'Lectura 1: Tom', 'Otra']);
  });
  it('lectura sin "seccion" → "General"', () => {
    expect(sections(exam([], [{ titulo: 'L', texto: 't', preguntas: [q()] }]))).toEqual(['General']);
  });
  it('agrupa: las preguntas de cada sección quedan juntas, en el orden de primera aparición', () => {
    const r = ok(exam([q({ seccion: 'B', enunciado: '1' }), q({ seccion: 'A', enunciado: '2' }), q({ seccion: 'B', enunciado: '3' }), q({ seccion: 'A', enunciado: '4' })]));
    const qs = r.plan.looseExams[0].questions;
    expect(qs.map((p) => `${p.section}${p.prompt}`)).toEqual(['B1', 'B3', 'A2', 'A4']);
    expect(examSections(r.plan.looseExams[0])).toEqual(['B', 'A']);
  });
  it('"seccion" que no es texto da error con ubicación', () => {
    expect(errs(exam([q({ seccion: 3 })]))[0]).toMatch(/Pregunta 1: "seccion" debe ser un texto/);
    expect(errs(exam([], [{ titulo: 'L', texto: 't', seccion: [], preguntas: [q()] }]))[0]).toMatch(/Lectura 1: "seccion" debe ser un texto/);
  });
  it('avisa si hay más de 20 preguntas en una sola sección', () => {
    const r = ok(exam(Array.from({ length: 21 }, () => q())));
    expect(r.warnings.join()).toMatch(/21 preguntas en una sola sección/);
    expect(ok(exam(Array.from({ length: 21 }, (_, i) => q({ seccion: i < 10 ? 'A' : 'B' })))).warnings).toEqual([]);
  });
});

describe('prompt para la IA: sus ejemplos son fiables', () => {
  it('cada ejemplo ✅ CORRECTO del prompt pasa la validación', async () => {
    const { JSON_PROMPT } = await import('@/features/import/jsonPrompt');
    const blocks = [...JSON_PROMPT.matchAll(/✅ CORRECTO \((\w+)\):\n([\s\S]*?)\n\n❌/g)];
    expect(blocks.map((b) => b[1])).toEqual(['multiple_choice', 'true_false', 'fill_blank', 'order_words', 'transform']);
    for (const [, tipo, json] of blocks) {
      const r = ok({ simulacros: [{ titulo: 'T', preguntas: [JSON.parse(json)] }] });
      expect(r.plan.looseExams[0].questions[0].type).toBe(tipo);
      expect(r.warnings, tipo).toEqual([]);
    }
  });
  it('los ejemplos ❌ INCORRECTO que son JSON válido se rechazan', async () => {
    const { JSON_PROMPT } = await import('@/features/import/jsonPrompt');
    const bad = [...JSON_PROMPT.matchAll(/❌ INCORRECTO:\n([\s\S]*?)\n\(/g)].map((b) => b[1]);
    expect(bad.length).toBe(5);
    for (const json of bad) {
      let q: unknown;
      try {
        q = JSON.parse(json);
      } catch {
        continue; // con paréntesis en vez de corchetes ya ni siquiera es JSON
      }
      errs({ simulacros: [{ titulo: 'T', preguntas: [q] }] });
    }
  });
  it('las advertencias de errores comunes llegan al texto (palabras sueltas, ___)', async () => {
    const { JSON_PROMPT } = await import('@/features/import/jsonPrompt');
    expect(JSON_PROMPT).toContain('"in the evening"');
    expect(JSON_PROMPT).toContain('SIEMPRE debe tener ___');
    expect(JSON_PROMPT).toContain('NO escapes los corchetes con \\.');
  });
  it('order_words con una frase compuesta en "palabras" se rechaza con un mensaje claro', () => {
    const e = errs(oneQ({ tipo: 'order_words', palabras: ['She', 'goes', 'in the evening'], correcta: 'She goes in the evening' }));
    expect(e[0]).toMatch(/no coinciden/);
  });
  it('fill_blank sin ___ se rechaza', () => {
    expect(errs(oneQ({ tipo: 'fill_blank', enunciado: 'She watches TV.', correcta: 'watches' }))[0]).toMatch(/___/);
  });
});

describe('guía de simulacros (selección múltiple)', () => {
  const load = () => import('@/features/import/jsonPrompt');
  const mc = (extra: object = {}) => ({ tipo: 'multiple_choice', enunciado: '¿Capital de Francia?', opciones: ['Madrid', 'París'], correcta: 1, ...extra });
  const warns = (q: object) => ok(oneQ(q)).warnings.join('\n');
  const REVISAR = [
    'PARA REVISAR',
    'Total de preguntas en el material: 6. Total en el JSON: 6.',
    'Sin respuesta en el material (no incluidas): ninguna',
    'Con imagen: 3',
    'Con respuestas contradictorias (no incluidas): ninguna',
    'Con texto dañado o dudoso (indica qué): ninguna',
  ].join('\n');

  it('el ejemplo del botón es válido, sin avisos, y conserva la lista, los símbolos y las comillas', async () => {
    const { JSON_EXAMPLE_SIMULACRO } = await load();
    const r = ok(JSON_EXAMPLE_SIMULACRO);
    expect(r.summary).toMatchObject({ folders: 1, exams: 1, questions: 6, readings: 1 });
    expect(r.summary.byType).toMatchObject({ multiple_choice: 5, true_false: 1 });
    expect(r.warnings).toEqual([]);
    const exam = r.plan.folders[0].exams[0];
    expect(examSections(exam)).toEqual(['Biología', 'Ley 1620']);
    const lista = exam.questions.find((q) => q.prompt.includes('Agredir'))!;
    expect(lista.prompt.split('\n')).toHaveLength(5); // intro + 3 ítems + cierre, un ítem por línea
    expect(lista.answer).toEqual({ correct: ['d'] });
    expect(exam.questions.some((q) => q.options?.some((o) => o.text.includes('CO₂')))).toBe(true);
    expect(exam.questions.some((q) => q.options?.some((o) => o.text.includes('3,5 individuos por m²')))).toBe(true);
    expect(exam.questions.some((q) => q.prompt.includes('“las plantas absorben dióxido de carbono”'))).toBe(true);
  });

  it('la guía incluye el mismo ejemplo y las reglas clave', async () => {
    const { JSON_PROMPT_SIMULACROS, JSON_EXAMPLE_SIMULACRO } = await load();
    expect(JSON_PROMPT_SIMULACROS).toContain(JSON_EXAMPLE_SIMULACRO);
    for (const frase of [
      'PARA REVISAR',
      'EMPEZANDO EN 0',
      '[IMAGEN]',
      'DATOS PERSONALES',
      'UN SALTO DE LÍNEA REAL DENTRO DE UN TEXTO ROMPE EL JSON',
      'NO la agregues como opción extra',
      'SIN las etiquetas "Respuesta: B"',
    ])
      expect(JSON_PROMPT_SIMULACROS, frase).toContain(frase);
    // las plantillas con \\n y \\" deben llegar al texto como \n y \" (lo que la IA debe escribir), no como saltos reales
    expect(JSON_PROMPT_SIMULACROS).toContain('escribe el par de caracteres \\n');
  });

  it('la guía cubre simulacros con la clave de respuestas al final, dentro del texto y antes de los datos del bloque', async () => {
    const { JSON_PROMPT_SIMULACROS } = await load();
    for (const frase of [
      'CLAVE DE RESPUESTAS AL FINAL DEL DOCUMENTO',
      'POSICIÓN | CLAVE | COMPONENTE | COMPETENCIA',
      'PREGUNTA | CLAVE | JUSTIFICACIÓN',
      'Sub-eje temático',
      'Licensed to',
    ])
      expect(JSON_PROMPT_SIMULACROS, frase).toContain(frase);
    expect(JSON_PROMPT_SIMULACROS.indexOf('CLAVE DE RESPUESTAS AL FINAL DEL DOCUMENTO')).toBeLessThan(JSON_PROMPT_SIMULACROS.indexOf('DATOS DE ESTE BLOQUE Y MATERIAL'));
    expect(JSON_PROMPT_SIMULACROS.trimEnd().endsWith('ya sin tus datos personales]')).toBe(true);
  });

  it('un simulacro con clave al final (3 opciones, lectura compartida, justificación) se importa con la sección del sub-eje', () => {
    const json = JSON.stringify({
      version: 1,
      bibliotecas: [
        {
          nombre: 'Concurso docente - Ciencias Naturales',
          simulacros: [
            {
              titulo: 'Simulacro 8',
              orden: 1,
              lecturas: [
                {
                  titulo: 'Situación 1-2: manglar y biología celular',
                  seccion: 'Biología celular y de organismos',
                  texto: 'Un docente de ciencias naturales diseña una unidad sobre transporte celular.',
                  preguntas: [
                    { tipo: 'multiple_choice', enunciado: 'Para iniciar la planeación, ¿cuál propósito articula mejor…?', opciones: ['Explicar el transporte…', 'Describir los organelos…', 'Identificar las partes…'], correcta: 0, explicacion: 'La opción A vincula un proceso celular con un fenómeno observable.' },
                    { tipo: 'multiple_choice', enunciado: '¿Qué propósito permite integrar los saberes previos?', opciones: ['Clasificar…', 'Ilustrar…', 'Evaluar…'], correcta: 2 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const r = ok(json);
    expect(r.warnings).toEqual([]);
    const exam = r.plan.folders[0].exams[0];
    expect(examSections(exam)).toEqual(['Biología celular y de organismos']);
    expect(exam.questions.map((q) => q.answer)).toEqual([{ correct: ['a'] }, { correct: ['c'] }]);
  });

  it('la respuesta en dos partes (JSON + "PARA REVISAR") se importa, con o sin ```', async () => {
    const { JSON_EXAMPLE_SIMULACRO } = await load();
    expect(ok('```json\n' + JSON_EXAMPLE_SIMULACRO + '\n```\n\n' + REVISAR).summary.questions).toBe(6);
    expect(ok(JSON_EXAMPLE_SIMULACRO + '\n\n' + REVISAR).summary.questions).toBe(6);
  });

  describe('lo que la guía dice que rompe, rompe de verdad (y lo que pide, funciona)', () => {
    const conTexto = (enunciado: string) => `{"simulacros":[{"titulo":"T","preguntas":[{"tipo":"true_false","enunciado":"${enunciado}","correcta":true}]}]}`;

    it('un salto de línea REAL dentro de un texto rompe el JSON; \\n funciona y es un salto', () => {
      expect(errs(conTexto('Lea:\n1. Uno'))[0]).toMatch(/no es un JSON válido/);
      expect(ok(conTexto('Lea:\\n1. Uno')).plan.looseExams[0].questions[0].prompt).toBe('Lea:\n1. Uno');
    });
    it('comillas rectas sin escapar rompen el JSON; las tipográficas y las escapadas funcionan', () => {
      expect(errs(conTexto('El docente dijo "hola"'))[0]).toMatch(/no es un JSON válido/);
      expect(ok(conTexto('El docente dijo “hola”')).plan.looseExams[0].questions[0].prompt).toBe('El docente dijo “hola”');
      expect(ok(conTexto('El docente dijo \\"hola\\"')).plan.looseExams[0].questions[0].prompt).toBe('El docente dijo "hola"');
    });
    it('"correcta" como letra o texto se rechaza; como número desde 0 funciona (A=0 … E=4) y como lista también', () => {
      expect(errs(oneQ(mc({ correcta: 'B' })))[0]).toMatch(/"correcta" debe ser el número de la opción correcta empezando en 0/);
      expect(errs(oneQ(mc({ correcta: 2 })))[0]).toMatch(/de 0 a 1/); // empezar en 1 se sale de rango en la última opción
      const cinco = ok(oneQ(mc({ opciones: ['a1', 'b2', 'c3', 'd4', 'e5'], correcta: 4 }))).plan.looseExams[0].questions[0];
      expect(cinco.answer).toEqual({ correct: ['e'] });
      const varias = ok(oneQ(mc({ opciones: ['a1', 'b2', 'c3'], correcta: [0, 2] }))).plan.looseExams[0].questions[0];
      expect(varias.answer).toEqual({ correct: ['a', 'c'] });
    });
    it('una lectura sin texto o sin preguntas se rechaza (por eso la guía los pide obligatorios)', () => {
      const lectura = (l: object) => ({ simulacros: [{ titulo: 'T', lecturas: [l] }] });
      expect(errs(lectura({ titulo: 'L', preguntas: [mc()] }))[0]).toMatch(/falta "texto"/);
      expect(errs(lectura({ titulo: 'L', texto: 't', preguntas: [] }))[0]).toMatch(/al menos 1 pregunta/);
      expect(errs(lectura({ texto: 't', preguntas: [mc()] }))[0]).toMatch(/falta "titulo"/);
    });
    it('las secciones se agrupan por nombre EXACTO: "Biologia" y "Biología" son dos secciones', () => {
      const e = ok({ simulacros: [{ titulo: 'T', preguntas: [mc({ seccion: 'Biología' }), mc({ seccion: 'Biologia' })] }] });
      expect(examSections(e.plan.looseExams[0])).toEqual(['Biología', 'Biologia']);
    });
    it('una lectura compartida se guarda UNA vez y todas sus preguntas apuntan a ella', () => {
      const r = ok({
        simulacros: [{ titulo: 'T', lecturas: [{ titulo: 'Caso', texto: 'Texto único', seccion: 'Ley 1620', preguntas: [mc(), mc({ enunciado: 'Otra' }), mc({ enunciado: 'Y otra' })] }] }],
      });
      const e = r.plan.looseExams[0];
      expect(e.readings).toHaveLength(1);
      expect(e.questions.map((q) => q.readingIndex)).toEqual([0, 0, 0]);
      expect(e.questions.every((q) => q.section === 'Ley 1620')).toBe(true);
    });
  });

  describe('avisos si la IA deja restos del PDF (no bloquean la importación)', () => {
    it('número de pregunta pegado al enunciado', () => {
      expect(warns(mc({ enunciado: '109) Las siguientes acciones corresponden a…' }))).toMatch(/número de pregunta/);
      expect(warns(mc({ enunciado: '20. En una institución educativa rural…' }))).toMatch(/número de pregunta/);
    });
    it('letras pegadas a las opciones ("A) …")', () => {
      expect(warns(mc({ opciones: ['A) tipo I', 'B) tipo II', 'C) tipo III'], correcta: 2 }))).toMatch(/empiezan con su letra/);
      expect(warns(mc({ opciones: ['a. Nacionales', 'b. Extranjeros'], correcta: 0 }))).toMatch(/empiezan con su letra/);
    });
    it('pie de página, enlaces y fechas del PDF', () => {
      expect(warns(mc({ enunciado: 'Texto 14/9/25, 3:04 p.m. SIMULACRO INGRESO' }))).toMatch(/el enunciado parece traer el pie de página/);
      expect(warns(mc({ opciones: ['https://docs.google.com/forms/d/e/1FAIpQ', 'Roma'] }))).toMatch(/alguna opción parece traer el pie de página/);
      expect(warns(mc({ explicacion: 'Ver viewscore?viewscore=AE0zAgBY3m5AG' }))).toMatch(/la explicación parece traer el pie de página/);
    });
    it('datos personales: correo y números largos (cédula, teléfono)', () => {
      expect(warns(mc({ explicacion: 'Escríbame a estebanvar796@gmail.com' }))).toMatch(/correo electrónico/);
      expect(warns(mc({ enunciado: 'Cédula 1003916823 del docente' }))).toMatch(/número muy largo/);
    });
    it('palabras cortadas por guion al final del renglón', () => {
      expect(warns(mc({ opciones: ['proponer la trans- formación', 'Roma'] }))).toMatch(/palabra cortada por guion/);
    });
    it('también en el texto de una lectura', () => {
      const r = ok({ simulacros: [{ titulo: 'T', lecturas: [{ titulo: 'L', texto: 'Caso. https://docs.google.com/forms/d/e/1FAIpQ', preguntas: [mc()] }] }] });
      expect(r.warnings.join('\n')).toMatch(/el texto parece traer el pie de página/);
    });
    it('NO avisa con texto legítimo: leyes, decimales, miles, guiones de la palabra, "pre- y"', () => {
      const w = warns(
        mc({
          enunciado: 'En la Ley 1098 de 2006 (Decreto 1278 de 2002) el valor es 3,5, con 1.250 m² en el estudio físico-químico pre- y posoperatorio.',
          opciones: ['A. Smith fue economista', 'Adam Smith nació en 1723'],
          explicacion: 'Según el art. 15, la Ley 599 de 2000 aplica.',
        }),
      );
      expect(w).toBe('');
    });
  });
});
