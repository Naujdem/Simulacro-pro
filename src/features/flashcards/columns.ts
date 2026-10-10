// La migración 0004 añade columnas (deck, back_imagen_ref, back_audio_ref). Si la app se despliega antes de
// ejecutarla, las pantallas deben seguir funcionando: se reintenta la consulta sin esas columnas.
export const isMissingColumn = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(e.message ?? ''));

export const DECK_ALL = '__all';
export const DECK_NONE = '__none';
