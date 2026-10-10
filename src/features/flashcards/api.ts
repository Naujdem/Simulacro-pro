import { supabase } from '@/lib/supabase';
import { DECK_NONE, isMissingColumn } from './columns';
import { DEFAULT_SETTINGS, SEP, planStudy, type DeckSettings, type StatRow } from './decks';
import type { Flashcard, StudyCard } from './types';

const PAGE = 1000; // Supabase devuelve como máximo 1000 filas por consulta

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('No hay sesión iniciada.');
  return id;
}

/* ───────────── Conteos: todas las fichas, solo con las columnas necesarias ───────────── */

const STAT_BASE = 'id,deck,created_at,interval_days,repetitions,review_count,due_at,last_reviewed_at';

export async function fetchStatRows(): Promise<{ rows: StatRow[]; missingSchema: boolean }> {
  let columns = `${STAT_BASE},introduced_at`;
  let missingSchema = false;
  const rows: StatRow[] = [];

  for (let from = 0; ; from += PAGE) {
    const run = (cols: string) =>
      supabase.from('flashcards').select(cols).order('created_at', { ascending: false }).order('id').range(from, from + PAGE - 1);

    let res = await run(columns);
    if (res.error && isMissingColumn(res.error) && columns.includes('introduced_at')) {
      // Aún no se ejecutó la migración 0005: todo funciona, pero sin contar las nuevas de hoy.
      columns = STAT_BASE;
      missingSchema = true;
      res = await run(columns);
    }
    if (res.error) throw res.error;
    const page = (res.data ?? []) as unknown as StatRow[];
    rows.push(...page);
    if (page.length < PAGE) return { rows, missingSchema };
  }
}

/* ───────────── Opciones por mazo ───────────── */

export async function fetchDeckSettings(): Promise<{ map: Map<string, DeckSettings>; missing: boolean }> {
  const { data, error } = await supabase.from('flashcard_decks').select('name,new_per_day,max_reviews_per_day');
  if (error) {
    if (isMissingColumn(error)) return { map: new Map(), missing: true }; // migración 0005 pendiente
    throw error;
  }
  const map = new Map<string, DeckSettings>();
  for (const d of data ?? []) map.set(d.name as string, { new_per_day: d.new_per_day, max_reviews_per_day: d.max_reviews_per_day });
  return { map, missing: false };
}

export async function saveDeckSettings(name: string, s: DeckSettings): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase
    .from('flashcard_decks')
    .upsert({ user_id, name, new_per_day: s.new_per_day, max_reviews_per_day: s.max_reviews_per_day }, { onConflict: 'user_id,name' });
  if (error) {
    throw new Error(
      isMissingColumn(error)
        ? 'Falta ejecutar la migración 0005_deck_options.sql en Supabase para guardar las opciones.'
        : error.message,
    );
  }
}

/** Crea las opciones de los mazos que aún no tienen (no pisa las que ya cambiaste). Nunca lanza error. */
export async function ensureDeckSettings(names: string[], s: DeckSettings): Promise<void> {
  try {
    const user_id = await currentUserId();
    const { error } = await supabase
      .from('flashcard_decks')
      .upsert(
        names.map((name) => ({ user_id, name, new_per_day: s.new_per_day, max_reviews_per_day: s.max_reviews_per_day })),
        { onConflict: 'user_id,name', ignoreDuplicates: true },
      );
    if (error) console.warn('No se guardaron las opciones de los mazos:', error.message);
  } catch (e) {
    console.warn('No se guardaron las opciones de los mazos:', e);
  }
}

/* ───────────── Mover / renombrar / eliminar ───────────── */

/** Limpia un nombre de mazo: sin espacios alrededor de "::" ni separadores sobrantes. */
export const cleanDeckName = (raw: string): string =>
  raw
    .split(SEP)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(SEP);

/** Cambia el nombre (o el grupo) de un mazo y de todos sus subgrupos. Devuelve el nombre final. */
export async function renameDeck(oldName: string, newNameRaw: string, allNames: string[]): Promise<string> {
  const newName = cleanDeckName(newNameRaw);
  if (!newName) throw new Error('El nombre no puede estar vacío.');
  if (newName === oldName) return oldName;
  if (newName.startsWith(oldName + SEP)) throw new Error('No puedes mover un mazo dentro de sí mismo.');

  const affected = allNames.filter((n) => n === oldName || n.startsWith(oldName + SEP));
  for (const from of affected) {
    const to = newName + from.slice(oldName.length);
    const { error } = await supabase.from('flashcards').update({ deck: to }).eq('deck', from);
    if (error) throw error;

    // Las opciones del mazo se mudan con él (si ya había opciones con el nombre nuevo, se respetan esas).
    try {
      const { data: old } = await supabase.from('flashcard_decks').select('new_per_day,max_reviews_per_day').eq('name', from).maybeSingle();
      if (old) {
        const user_id = await currentUserId();
        await supabase.from('flashcard_decks').upsert({ user_id, name: to, ...old }, { onConflict: 'user_id,name', ignoreDuplicates: true });
        await supabase.from('flashcard_decks').delete().eq('name', from);
      }
    } catch (e) {
      console.warn('No se pudieron mover las opciones del mazo:', e);
    }
  }
  return newName;
}

/** Elimina las fichas de los mazos indicados (null = fichas sin mazo) y sus opciones. */
export async function deleteDecks(names: (string | null)[]): Promise<void> {
  const real = names.filter((n): n is string => n !== null);
  if (real.length) {
    const { error } = await supabase.from('flashcards').delete().in('deck', real);
    if (error) throw error;
    const del = await supabase.from('flashcard_decks').delete().in('name', real);
    if (del.error) console.warn('No se pudieron borrar las opciones:', del.error.message);
  }
  if (names.includes(null)) {
    const { error } = await supabase.from('flashcards').delete().is('deck', null);
    if (error) throw error;
  }
}

/* ───────────── Lista de fichas de un mazo ───────────── */

export async function fetchDeckCards(deck: string | null): Promise<Flashcard[]> {
  const cols = 'id,front,back,created_at,imagen_ref,audio_ref,back_audio_ref,deck';
  const all: Flashcard[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('flashcards').select(cols);
    q = deck === null ? q.is('deck', null) : q.eq('deck', deck);
    const { data, error } = await q.order('created_at', { ascending: false }).order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as Flashcard[];
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}

/* ───────────── Cola de estudio ───────────── */

const FULL =
  'id,front,back,created_at,review_count,ease_factor,interval_days,repetitions,imagen_ref,audio_ref,back_imagen_ref,back_audio_ref,deck';

/**
 * Fichas que tocan hoy. `scope`: null = todos los mazos; DECK_NONE = sin mazo; un nombre = ese mazo y sus subgrupos.
 * Aplica las opciones de cada mazo (nuevas por día, máximo de repasos por día).
 */
export async function buildStudyQueue(scope: string | null, now: Date = new Date()): Promise<StudyCard[]> {
  const [{ rows }, { map: settings }] = await Promise.all([fetchStatRows(), fetchDeckSettings()]);
  const ids = planStudy(rows, settings, scope === '' ? null : scope, now);
  if (ids.length === 0) return [];

  const byId = new Map<string, StudyCard>();
  for (let i = 0; i < ids.length; i += 80) {
    const { data, error } = await supabase.from('flashcards').select(FULL).in('id', ids.slice(i, i + 80));
    if (error) throw error;
    for (const c of (data ?? []) as unknown as StudyCard[]) {
      byId.set(c.id, { ...c, review_count: c.review_count ?? 0, ease_factor: Number(c.ease_factor) || 2.5, interval_days: c.interval_days ?? 0, repetitions: c.repetitions ?? 0 });
    }
  }
  return ids.map((id) => byId.get(id)).filter((c): c is StudyCard => !!c);
}

export { DECK_NONE, DEFAULT_SETTINGS };
