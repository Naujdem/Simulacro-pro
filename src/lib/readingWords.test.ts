import { describe, expect, it } from 'vitest';
import { normalizeWord, phraseBetween, sentenceAt, splitWords, wordsOf } from './readingWords';

describe('splitWords', () => {
  it('separa palabras de espacios y puntuación sin perder nada', () => {
    const t = 'Tom visited London, and he’s happy! 2010.';
    const parts = splitWords(t);
    expect(parts.map((p) => p.text).join('')).toBe(t);
    expect(parts.filter((p) => p.word).map((p) => p.text)).toEqual(['Tom', 'visited', 'London', 'and', 'he’s', 'happy']);
  });
  it('apóstrofos y guiones dentro de la palabra; números no son palabras', () => {
    expect(splitWords("don't mother-in-law 12 café").filter((p) => p.word).map((p) => p.text)).toEqual(["don't", 'mother-in-law', 'café']);
  });
  it('las posiciones coinciden con el texto original', () => {
    const t = '  Hello, world';
    for (const p of splitWords(t)) expect(t.slice(p.start, p.start + p.text.length)).toBe(p.text);
  });
  it('texto vacío', () => {
    expect(splitWords('')).toEqual([]);
  });
});

describe('sentenceAt', () => {
  const t = 'Last summer Tom visited London. He has always wanted to see Big Ben!\nIs it big? Yes.';
  it('devuelve la frase de la palabra tocada', () => {
    expect(sentenceAt(t, t.indexOf('visited'))).toBe('Last summer Tom visited London.');
    expect(sentenceAt(t, t.indexOf('wanted'))).toBe('He has always wanted to see Big Ben!');
    expect(sentenceAt(t, t.indexOf('big?'))).toBe('Is it big?');
  });
  it('primera y última frase, y texto sin puntos', () => {
    expect(sentenceAt(t, 0)).toBe('Last summer Tom visited London.');
    expect(sentenceAt(t, t.indexOf('Yes'))).toBe('Yes.');
    expect(sentenceAt('no punctuation here', 5)).toBe('no punctuation here');
  });
  it('junta saltos de línea y espacios dobles', () => {
    expect(sentenceAt('A  b\n c d.', 8)).toBe('c d.');
  });
});

describe('normalizeWord', () => {
  it('minúsculas y apóstrofo normal', () => {
    expect(normalizeWord('Don’t')).toBe("don't");
  });
});

describe('phraseBetween', () => {
  const t = 'He decided to give it up, but I looked  forward to\nit.';
  const w = wordsOf(t);
  const at = (x: string) => w.findIndex((p) => p.text === x);
  it('une las palabras elegidas con lo que hay entre ellas', () => {
    expect(phraseBetween(t, w, at('give'), at('up'))).toBe('give it up');
    expect(phraseBetween(t, w, at('up'), at('but'))).toBe('up, but');
  });
  it('junta saltos de línea y espacios dobles', () => {
    expect(phraseBetween(t, w, at('looked'), at('looked') + 2)).toBe('looked forward to');
  });
  it('una sola palabra y orden invertido', () => {
    expect(phraseBetween(t, w, at('decided'), at('decided'))).toBe('decided');
    expect(phraseBetween(t, w, at('up'), at('give'))).toBe('give it up');
  });
  it('posiciones fuera del texto', () => {
    expect(phraseBetween(t, w, 0, 999)).toBe('');
    expect(phraseBetween('', [], 0, 0)).toBe('');
  });
});

describe('sentenceAt con varias palabras', () => {
  const t = 'It was late. She gave up. Then she left.';
  it('con el final de la selección sigue la misma frase', () => {
    expect(sentenceAt(t, t.indexOf('gave'), t.indexOf('up') + 1)).toBe('She gave up.');
  });
  it('si la selección cruza frases, abarca de la primera a la última', () => {
    expect(sentenceAt(t, t.indexOf('gave'), t.indexOf('Then'))).toBe('She gave up. Then she left.');
  });
});
