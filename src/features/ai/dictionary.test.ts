import { describe, expect, it } from 'vitest';
import { baseForms, parseEntries } from './dictionary';

describe('parseEntries', () => {
  it('toma fonética, audio y definiciones con su ejemplo', () => {
    const e = parseEntries([
      {
        word: 'nowadays',
        phonetic: '/ˈnaʊ.ə.deɪz/',
        phonetics: [{ audio: '' }, { text: '/x/', audio: '//example.com/nowadays.mp3' }],
        meanings: [{ partOfSpeech: 'adverb', definitions: [{ definition: 'At the present time.', example: 'Nowadays everyone has a phone.' }] }],
      },
    ]);
    expect(e).toEqual({
      word: 'nowadays',
      phonetic: '/ˈnaʊ.ə.deɪz/',
      audio: 'https://example.com/nowadays.mp3',
      meanings: [{ pos: 'adverb', definitions: [{ text: 'At the present time.', example: 'Nowadays everyone has a phone.' }] }],
    });
  });

  it('une categorías repetidas y limita la cantidad', () => {
    const defs = (n: number) => Array.from({ length: n }, (_, i) => ({ definition: `d${i}` }));
    const e = parseEntries([
      { word: 'run', meanings: [{ partOfSpeech: 'verb', definitions: defs(2) }] },
      { word: 'run', meanings: [{ partOfSpeech: 'verb', definitions: defs(5) }, { partOfSpeech: 'noun', definitions: defs(1) }] },
    ]);
    expect(e!.meanings.map((m) => m.pos)).toEqual(['verb', 'noun']);
    expect(e!.meanings[0].definitions).toHaveLength(3);
  });

  it('sin definiciones o con respuesta de error devuelve null', () => {
    expect(parseEntries({ title: 'No Definitions Found' })).toBeNull();
    expect(parseEntries([])).toBeNull();
    expect(parseEntries([{ word: 'x', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: '  ' }] }] }])).toBeNull();
  });
});

describe('baseForms', () => {
  it('prueba primero la palabra tal cual y luego sus formas base', () => {
    expect(baseForms('Played')).toEqual(['played', 'play', 'playe']);
    expect(baseForms('studies')).toContain('study');
    expect(baseForms('running')).toContain('run');
    expect(baseForms('making')).toContain('make');
    expect(baseForms('Mary’s')).toEqual(['mary']);
  });
});
