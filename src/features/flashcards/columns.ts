// Las migraciones 0004 y 0005 añaden columnas y una tabla. Si la app se despliega antes de ejecutarlas,
// las pantallas deben seguir funcionando: se detecta el error y se reintenta sin esas columnas / se usan valores por defecto.
export const isMissingColumn = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e &&
  (e.code === '42703' ||
    e.code === 'PGRST204' ||
    e.code === '42P01' ||
    e.code === 'PGRST205' ||
    /does not exist|could not find the .* (column|table)|schema cache/i.test(e.message ?? ''));

export const DECK_ALL = '__all';
/** Valor especial de ?deck= para las fichas que no pertenecen a ningún mazo. */
export const DECK_NONE = '__none';
