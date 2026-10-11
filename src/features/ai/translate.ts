import { supabase } from '@/lib/supabase';
import { normalizeWord } from '@/lib/readingWords';

/** IA que traduce: OpenRouter (por defecto) o Gemini (alternativa si OpenRouter no funciona o no tiene saldo). */
export type AiProvider = 'openrouter' | 'gemini';
export const PROVIDER_NAMES: Record<AiProvider, string> = { openrouter: 'OpenRouter', gemini: 'Gemini' };
const KEY = 'simulapro:translate-provider';

/** La elección se recuerda en este dispositivo. */
export function getProvider(): AiProvider {
  try {
    return localStorage.getItem(KEY) === 'gemini' ? 'gemini' : 'openrouter';
  } catch {
    return 'openrouter';
  }
}
export function setProvider(p: AiProvider): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* sin almacenamiento: la elección vale solo mientras la ventana está abierta */
  }
}

// Traducciones pedidas en esta sesión (también las que van en camino): tocar la misma palabra en la misma frase
// con la misma IA no vuelve a gastar solicitudes.
const cache = new Map<string, Promise<Translation>>();

/** Traducción y la IA que la dio (puede ser la otra si la elegida falló). */
export interface Translation {
  text: string;
  provider: AiProvider;
}

interface Reply {
  ok: boolean;
  traduccion?: string;
  proveedor?: AiProvider;
  mensaje?: string;
}

async function ask(word: string, sentence: string, provider: AiProvider): Promise<Translation> {
  const { data, error } = await supabase.functions.invoke('ia-traducir', { body: { palabra: word, frase: sentence, proveedor: provider } });
  if (error) throw new Error('No se pudo contactar la función ia-traducir. Revisa que esté desplegada en Supabase.');
  const r = data as Reply | null;
  if (!r) throw new Error('La función no devolvió nada.');
  if (!r.ok || !r.traduccion) throw new Error(r.mensaje ?? 'No se pudo traducir.');
  return { text: r.traduccion, provider: r.proveedor ?? provider };
}

/** Traduce una palabra en inglés al español con la IA elegida (función ia-traducir), usando su frase como contexto. */
export function translateWord(word: string, sentence: string, provider: AiProvider = 'openrouter'): Promise<Translation> {
  const key = `${provider}|${normalizeWord(word)}|${sentence}`;
  let p = cache.get(key);
  if (!p) {
    p = ask(word, sentence, provider);
    cache.set(key, p);
    p.catch(() => cache.delete(key)); // un fallo no se guarda: al volver a tocar se reintenta
  }
  return p;
}
