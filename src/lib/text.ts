export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // quita puntuación
    .replace(/\s+/g, ' ')
    .trim();

export const toBool = (s: string): boolean | null => {
  const n = norm(s);
  if (['verdadero', 'true', 'v'].includes(n)) return true;
  if (['falso', 'false', 'f'].includes(n)) return false;
  return null;
};
