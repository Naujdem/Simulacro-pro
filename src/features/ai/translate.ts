import { supabase } from '@/lib/supabase';
import { normalizeWord } from '@/lib/readingWords';

// Traducciones pedidas en esta sesión (también las que van en camino): tocar la misma palabra en la misma frase
// no vuelve a gastar IA.
const cache = new Map<string, Promise<string>>();

interface Reply {
  ok: boolean;
  traduccion?: string;
  mensaje?: string;
}

async function ask(word: string, sentence: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ia-traducir', { body: { palabra: word, frase: sentence } });
  if (error) throw new Error('No se pudo contactar la función ia-traducir. Revisa que esté desplegada en Supabase.');
  const r = data as Reply | null;
  if (!r) throw new Error('La función no devolvió nada.');
  if (!r.ok || !r.traduccion) throw new Error(r.mensaje ?? 'No se pudo traducir.');
  return r.traduccion;
}

/** Traduce una palabra en inglés al español con la IA (función ia-traducir), usando su frase como contexto. */
export function translateWord(word: string, sentence: string): Promise<string> {
  const key = `${normalizeWord(word)}|${sentence}`;
  let p = cache.get(key);
  if (!p) {
    p = ask(word, sentence);
    cache.set(key, p);
    p.catch(() => cache.delete(key)); // un fallo no se guarda: al volver a tocar se reintenta
  }
  return p;
}
