// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSavedWords } from './BookText';

describe('loadSavedWords', () => {
  beforeEach(() => localStorage.clear());
  it('recupera las palabras guardadas de ese libro y tolera datos dañados', () => {
    expect(loadSavedWords('a').size).toBe(0);
    localStorage.setItem('simulapro:book-words:a', JSON.stringify(['crew', 3, 'still']));
    expect([...loadSavedWords('a')]).toEqual(['crew', 'still']);
    expect(loadSavedWords('b').size).toBe(0);
    localStorage.setItem('simulapro:book-words:b', '{nope');
    expect(loadSavedWords('b').size).toBe(0);
  });
});
