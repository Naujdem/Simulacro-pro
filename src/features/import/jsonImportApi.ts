import { supabase } from '@/lib/supabase';
import { norm } from '@/lib/text';
import { isMissingColumn } from '@/features/flashcards/columns';
import { ensureDeckSettings } from '@/features/flashcards/api';
import { DEFAULT_SETTINGS } from '@/features/flashcards/decks';
import type { Folder } from '@/features/exams/api';
import type { ImportPlan, PlanExam } from '@/lib/jsonImport';

export interface ImportResult {
  folders: number; // bibliotecas nuevas
  reusedFolders: number; // bibliotecas que ya existían y se reutilizaron
  exams: number;
  questions: number;
  readings: number;
  cards: number;
}

type Err = { code?: string; message: string } | null;

const SQL_HINT = 'Falta ejecutar en Supabase el SQL del importador (supabase/migrations/0007_importador_json.sql).';
const explain = (e: Err): Error =>
  new Error(isMissingColumn(e) || e?.code === '23514' ? SQL_HINT + ` (${e?.message})` : e?.message ?? 'Error desconocido');

/** ¿Esta biblioteca del JSON ya existe (mismo nombre, sin importar mayúsculas ni tildes)? */
export const findFolder = (existing: Folder[], name: string): Folder | undefined =>
  existing.find((f) => norm(f.name) === norm(name));

const chunks = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Crea todo en Supabase. Si algo falla a la mitad, borra lo que ya había creado (todo o nada).
 * Las bibliotecas que ya existían (mismo nombre) se reutilizan y NUNCA se borran al deshacer.
 */
export async function runImport(plan: ImportPlan, existing: Folder[], onProgress: (msg: string) => void = () => {}): Promise<ImportResult> {
  const made = { folders: [] as string[], exams: [] as string[], cards: [] as string[] };
  const result: ImportResult = { folders: 0, reusedFolders: 0, exams: 0, questions: 0, readings: 0, cards: 0 };

  try {
    const { data: u, error: ue } = await supabase.auth.getUser();
    if (ue || !u.user) throw new Error('Tu sesión expiró: vuelve a iniciar sesión.');
    const userId = u.user.id;
    const base = Date.now();

    // 1) Bibliotecas
    const madeByName = new Map<string, string>(); // por si el JSON repite el nombre de una biblioteca
    const jobs: { exam: PlanExam; folderId: string | null }[] = [];
    for (const f of plan.folders) {
      onProgress(`Creando biblioteca «${f.name}»…`);
      let id = madeByName.get(norm(f.name)) ?? findFolder(existing, f.name)?.id;
      if (id) {
        if (!madeByName.has(norm(f.name))) result.reusedFolders++;
      }
      else {
        const { data, error } = await supabase
          .from('folders')
          .insert({ user_id: userId, name: f.name, color: f.color, description: f.description })
          .select('id')
          .single();
        if (error) throw explain(error);
        id = data.id as string;
        made.folders.push(id);
        madeByName.set(norm(f.name), id);
        result.folders++;
      }
      for (const exam of f.exams) jobs.push({ exam, folderId: id });
    }
    for (const exam of plan.looseExams) jobs.push({ exam, folderId: null });

    // 2) Simulacros, lecturas y preguntas
    let n = 0;
    for (const { exam, folderId } of jobs) {
      onProgress(`Guardando simulacro ${++n} de ${jobs.length}: «${exam.title}»…`);
      const { data: ex, error: e1 } = await supabase
        .from('exams')
        .insert({
          user_id: userId,
          title: exam.title,
          subject: exam.subject,
          description: exam.description,
          folder_id: folderId,
          question_count: exam.questions.length,
          position: exam.position,
          // La lista se muestra "más nuevo primero": así los simulacros salen en el orden pedido
          created_at: new Date(base - exam.position * 1000).toISOString(),
        })
        .select('id')
        .single();
      if (e1) throw explain(e1);
      made.exams.push(ex.id as string);
      result.exams++;

      const readingIds: string[] = [];
      if (exam.readings.length) {
        const { data: rs, error } = await supabase
          .from('reading_texts')
          .insert(exam.readings.map((r, position) => ({ user_id: userId, exam_id: ex.id, position, title: r.title, body: r.body })))
          .select('id,position');
        if (error) throw explain(error);
        for (const r of rs ?? []) readingIds[r.position as number] = r.id as string;
        result.readings += exam.readings.length;
      }

      const rows = exam.questions.map((q, position) => ({
        exam_id: ex.id,
        user_id: userId,
        position,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        reading_id: q.readingIndex === null ? null : readingIds[q.readingIndex] ?? null,
      }));
      for (const part of chunks(rows, 200)) {
        const { error } = await supabase.from('questions').insert(part);
        if (error) throw explain(error);
      }
      result.questions += rows.length;
    }

    // 3) Fichas
    if (plan.cards.length) {
      const rows = plan.cards.map((c, i) => ({
        front: c.front,
        back: c.back,
        deck: c.deck,
        created_at: new Date(base - i).toISOString(), // conservan el orden del JSON
      }));
      let done = 0;
      for (const part of chunks(rows, 500)) {
        onProgress(`Guardando fichas… ${done} de ${rows.length}`);
        const { data, error } = await supabase.from('flashcards').insert(part).select('id');
        if (error) throw explain(error);
        made.cards.push(...(data ?? []).map((r) => r.id as string));
        done += part.length;
      }
      result.cards = rows.length;
      const decks = [...new Set(plan.cards.map((c) => c.deck).filter((d): d is string => !!d))];
      if (decks.length) await ensureDeckSettings(decks, DEFAULT_SETTINGS); // opciones por defecto; nunca falla
    }

    return result;
  } catch (e) {
    onProgress('Algo falló: deshaciendo lo que ya se había guardado…');
    const leftovers = await rollback(made);
    const msg = (e as Error).message;
    throw new Error(
      leftovers
        ? `${msg}\n\nNo se pudo deshacer todo (quedaron ${leftovers}). Bórralo a mano desde la app antes de reintentar.`
        : `${msg}\n\nNo se guardó nada: puedes corregir y volver a intentar.`,
    );
  }
}

/** Borra lo creado en una importación fallida. Devuelve un texto con lo que NO se pudo borrar, o '' si quedó limpio. */
async function rollback(made: { folders: string[]; exams: string[]; cards: string[] }): Promise<string> {
  const left: string[] = [];
  let cards = 0;
  for (const part of chunks(made.cards, 80)) {
    const { error } = await supabase.from('flashcards').delete().in('id', part);
    if (error) cards += part.length;
  }
  if (cards) left.push(`${cards} fichas`);
  let exams = 0;
  for (const part of chunks(made.exams, 80)) {
    const { error } = await supabase.from('exams').delete().in('id', part); // borra también sus preguntas y lecturas
    if (error) exams += part.length;
  }
  if (exams) left.push(`${exams} simulacros`);
  let folders = 0;
  for (const part of chunks(made.folders, 80)) {
    const { error } = await supabase.from('folders').delete().in('id', part);
    if (error) folders += part.length;
  }
  if (folders) left.push(`${folders} bibliotecas`);
  return left.join(', ');
}
