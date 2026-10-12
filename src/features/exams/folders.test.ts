import { describe, expect, it } from 'vitest';
import { folderChain, folderPath, folderTreeIds, type Folder } from './api';

const f = (id: string, name: string, parent_id: string | null = null): Folder => ({
  id,
  name,
  color: null,
  parent_id,
  created_at: '',
});
const tree = [f('q', 'Química'), f('o', 'Orgánica', 'q'), f('a', 'Alcanos', 'o'), f('m', 'Matemáticas')];

describe('subbibliotecas', () => {
  it('arma la ruta desde la biblioteca de primer nivel', () => {
    expect(folderPath(tree, 'a')).toBe('Química › Orgánica › Alcanos');
    expect(folderChain(tree, 'm').map((x) => x.id)).toEqual(['m']);
    expect(folderPath(tree, null)).toBe('');
  });

  it('reúne una biblioteca con todas sus subbibliotecas', () => {
    expect([...folderTreeIds(tree, 'q')].sort()).toEqual(['a', 'o', 'q']);
    expect([...folderTreeIds(tree, 'm')]).toEqual(['m']);
  });

  it('no se cuelga si hubiera un ciclo', () => {
    const loop = [f('x', 'X', 'y'), f('y', 'Y', 'x')];
    expect(folderChain(loop, 'x').length).toBe(2);
    expect(folderTreeIds(loop, 'x').size).toBe(2);
  });
});
