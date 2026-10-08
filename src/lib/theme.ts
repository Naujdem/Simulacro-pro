export type Theme = 'light' | 'dark' | 'system';

export function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export const getTheme = (): Theme => (localStorage.getItem('theme') as Theme) || 'system';

export function setTheme(t: Theme) {
  localStorage.setItem('theme', t);
  applyTheme(t);
}
