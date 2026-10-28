import { describe, expect, it } from 'vitest';
import { formatCardText, joinRefs, splitRefs } from './media';

describe('varios audios por lado', () => {
  it('lee fichas viejas con un solo audio y fichas nuevas con varios', () => {
    expect(splitRefs(null)).toEqual([]);
    expect(splitRefs('gd:abc')).toEqual(['gd:abc']);
    expect(splitRefs('gd:a\ngd:b\ngd:c')).toEqual(['gd:a', 'gd:b', 'gd:c']);
  });

  it('une los audios quitando vacíos y repetidos', () => {
    expect(joinRefs(['gd:a', null, 'gd:b', 'gd:a'])).toBe('gd:a\ngd:b');
    expect(joinRefs([null, undefined])).toBeNull();
    expect(splitRefs(joinRefs(['gd:x', 'gd:y']))).toEqual(['gd:x', 'gd:y']);
  });
});

describe('formatCardText', () => {
  const back = [
    'approach',
    "[ə'prəutʃ]",
    'acercarse / aproximarse',
    'To approach something means to move close to it.→  The boy approached his school.',
    'Acercarse a algo significa moverse cerca de ello. → El niño se acercó a su escuela.',
    'Word:',
    'Meaning:',
    'Example:',
  ].join('\n');

  it('quita las etiquetas vacías y separa definición y ejemplo', () => {
    expect(formatCardText(back)).toEqual([
      { kind: 'title', text: 'approach' },
      { kind: 'phonetic', text: "[ə'prəutʃ]" },
      { kind: 'short', text: 'acercarse / aproximarse' },
      { kind: 'long', text: 'To approach something means to move close to it.' },
      { kind: 'example', text: 'The boy approached his school.' },
      { kind: 'long', text: 'Acercarse a algo significa moverse cerca de ello.' },
      { kind: 'example', text: 'El niño se acercó a su escuela.' },
    ]);
  });

  it('no toca etiquetas que sí tienen contenido', () => {
    expect(formatCardText('Word: dog').map((l) => l.text)).toEqual(['Word: dog']);
  });
});
