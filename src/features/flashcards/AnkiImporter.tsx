import React, { useEffect, useState } from 'react';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
// El .wasm se empaqueta con la app: así coincide con la versión instalada de sql.js y funciona offline (PWA).
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { supabase } from '@/lib/supabase';
import { DriveError, connectDrive, getToken, preloadGis, uploadAudio, uploadImage } from '@/lib/drive';
import { buildMediaIndex, lookupMedia, readAnkiCollection, type AnkiCard } from './ankiParser';
import { scheduleImportedCards } from './ankiSchedule';
import { ensureDeckSettings } from './api';
import { isMissingColumn } from './columns';
import { DEFAULT_MAX_REVIEWS } from './decks';

interface AnkiImporterProps {
  onImportSuccess?: () => void;
}

const NEW_FORMAT_MSG =
  'Este .apkg usa el formato nuevo de Anki. Expórtalo de nuevo marcando "Soporte para versiones anteriores de Anki" (Compatible with older Anki versions).';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  flac: 'audio/flac', webm: 'audio/webm', mp4: 'video/mp4',
};
const mimeFor = (name: string) => MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
const isUrl = (s: string) => /^https?:\/\//i.test(s);

/** Ejecuta `fn` sobre todos los elementos con a lo sumo `limit` en paralelo. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

interface Pending {
  cards: AnkiCard[];
  crt: number;
  skipped: number;
  extraMedia: number;
  zip: JSZip;
  mediaIndex: Map<string, string>;
  mediaNames: Map<string, 'image' | 'audio'>;
}

export const AnkiImporter: React.FC<AnkiImporterProps> = ({ onImportSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [driveIssue, setDriveIssue] = useState<{ needsConnect: boolean; message: string } | null>(null);
  const [newPerDay, setNewPerDay] = useState('20');
  const [keepProgress, setKeepProgress] = useState(true);

  // Cargar el script de Google antes del clic evita que el navegador bloquee la ventana de "Conectar Drive".
  useEffect(() => {
    if (driveIssue?.needsConnect) preloadGis().catch(() => {});
  }, [driveIssue]);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;

    setLoading(true);
    setError('');
    setReport([]);
    setPending(null);
    setDriveIssue(null);
    setProgress(null);

    try {
      setStatus('Leyendo archivo .apkg...');
      const zip = await JSZip.loadAsync(file);

      // Anki moderno (2.1.50+) exporta por defecto un formato comprimido (collection.anki21b) y deja en
      // collection.anki2 una colección "señuelo". Solo se puede leer si trae collection.anki21 o el formato antiguo.
      const anki21b = zip.file('collection.anki21b');
      const dbFile = zip.file('collection.anki21') ?? (anki21b ? null : zip.file('collection.anki2'));
      if (!dbFile) throw new Error(anki21b ? NEW_FORMAT_MSG : 'El archivo .apkg no contiene una colección válida de Anki.');

      setStatus('Inicializando motor de base de datos...');
      const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });

      setStatus('Leyendo mazos y fichas...');
      const db = new SQL.Database(await dbFile.async('uint8array'));
      let collection;
      try {
        collection = readAnkiCollection(db);
      } finally {
        db.close();
      }

      // Si faltan las columnas de la migración 0004 es mejor avisar ahora que fallar a mitad de la importación.
      const { error: colError } = await supabase.from('flashcards').select('deck,back_imagen_ref,back_audio_ref').limit(1);
      if (colError) {
        throw new Error(
          isMissingColumn(colError)
            ? 'Falta una actualización de la base de datos: ejecuta supabase/migrations/0004_flashcards_decks_media.sql en el SQL Editor de Supabase y vuelve a importar.'
            : colError.message,
        );
      }

      const mediaFile = zip.file('media');
      const mediaIndex = buildMediaIndex(mediaFile ? await mediaFile.async('text') : null);

      const mediaNames = new Map<string, 'image' | 'audio'>();
      for (const c of collection.cards) {
        for (const n of [c.frontImage, c.backImage]) if (n && !isUrl(n)) mediaNames.set(n, 'image');
        for (const n of [c.frontAudio, c.backAudio]) if (n && !isUrl(n)) mediaNames.set(n, 'audio');
      }

      const p: Pending = { ...collection, zip, mediaIndex, mediaNames };

      if (mediaNames.size > 0) {
        setStatus('Comprobando la conexión con Google Drive...');
        try {
          await getToken();
        } catch (e) {
          const needsConnect = e instanceof DriveError && (e.code === 'noconnect' || e.code === 'reconnect');
          setPending(p);
          setDriveIssue({ needsConnect, message: (e as Error).message });
          setStatus('');
          return; // espera la decisión del usuario
        }
      }

      await runImport(p, true);
    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Ocurrió un problema durante la importación.');
      setStatus('');
    } finally {
      setLoading(false);
    }
  }

  async function runImport(p: Pending, withMedia: boolean) {
    // 1) Multimedia → Google Drive (una sola vez por archivo, aunque lo usen muchas fichas)
    const refs = new Map<string, string | null>();
    let uploaded = 0;
    let failed = 0;
    let missing = 0;
    let driveStopped = false;

    if (withMedia && p.mediaNames.size > 0) {
      const jobs = [...p.mediaNames.entries()];
      let done = 0;
      setProgress({ done: 0, total: jobs.length });
      setStatus('Subiendo imágenes y audios a Google Drive...');

      await mapLimit(jobs, 4, async ([name, kind]) => {
        try {
          const zipKey = lookupMedia(p.mediaIndex, name);
          const entry = zipKey ? p.zip.file(zipKey) : null;
          if (!entry) {
            missing++;
          } else if (!driveStopped) {
            const blob = new Blob([await entry.async('blob')], { type: mimeFor(name) });
            refs.set(name, kind === 'image' ? await uploadImage(blob) : await uploadAudio(blob));
            uploaded++;
          }
        } catch (e) {
          console.error(`No se pudo subir ${name}:`, e);
          failed++;
          if (e instanceof DriveError && (e.code === 'noconnect' || e.code === 'reconnect')) driveStopped = true;
        }
        setProgress({ done: ++done, total: jobs.length });
      });
    }

    const refOf = (n: string | null): string | null => (!n ? null : isUrl(n) ? n : refs.get(n) ?? null);

    // 2) SM-2: las nuevas quedan sin estudiar; las que ya traían progreso de Anki lo conservan
    const perDay = Math.min(500, Math.max(1, parseInt(newPerDay, 10) || 20));
    const schedule = scheduleImportedCards(p.cards, { crt: p.crt, keepProgress });

    // 3) Guardar en lotes. created_at decrece con la posición para que, al listar "más nuevas primero",
    //    las fichas salgan en el mismo orden que en Anki.
    const base = Date.now();
    const rows = p.cards.map((c, i) => ({
      front: c.front,
      back: c.back,
      deck: c.deck,
      imagen_ref: refOf(c.frontImage),
      audio_ref: refOf(c.frontAudio),
      back_imagen_ref: refOf(c.backImage),
      back_audio_ref: refOf(c.backAudio),
      ease_factor: schedule[i].easeFactor,
      interval_days: schedule[i].intervalDays,
      repetitions: schedule[i].repetitions,
      due_at: schedule[i].dueAt.toISOString(),
      created_at: new Date(base - i).toISOString(),
    }));

    setStatus('Guardando fichas...');
    setProgress({ done: 0, total: rows.length });
    const BATCH = 200;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: insError } = await supabase.from('flashcards').insert(rows.slice(i, i + BATCH));
      if (insError) {
        throw new Error(
          `Se guardaron ${i} de ${rows.length} fichas y luego falló: ${insError.message}. ` +
            'Elimina el mazo parcial desde la lista antes de volver a importar.',
        );
      }
      setProgress({ done: Math.min(i + BATCH, rows.length), total: rows.length });
    }

    // 4) Opciones de cada mazo (nuevas por día / máximo de repasos); no pisa las que ya tuvieran
    const perDeck = new Map<string, number>();
    p.cards.forEach((c) => perDeck.set(c.deck, (perDeck.get(c.deck) ?? 0) + 1));
    await ensureDeckSettings([...perDeck.keys()], { new_per_day: perDay, max_reviews_per_day: DEFAULT_MAX_REVIEWS });

    // 5) Resumen
    const fresh = schedule.filter((s) => s.repetitions === 0 && s.intervalDays === 0);

    const lines = [`Importación completada: ${rows.length} fichas en ${perDeck.size} ${perDeck.size === 1 ? 'mazo' : 'mazos'}.`];
    [...perDeck.entries()].forEach(([deck, n]) => lines.push(`• ${deck}: ${n}`));
    if (fresh.length) {
      lines.push(
        `${fresh.length} fichas nuevas: saldrán ${perDay} por día en cada mazo (puedes cambiarlo en ⚙️ Opciones del mazo).`,
      );
    }
    if (rows.length - fresh.length > 0) lines.push(`${rows.length - fresh.length} fichas conservan su progreso de Anki.`);
    if (uploaded) lines.push(`${uploaded} imágenes/audios subidos a Google Drive.`);
    if (!withMedia && p.mediaNames.size) lines.push(`Se omitieron ${p.mediaNames.size} imágenes/audios (importado sin multimedia).`);
    if (missing) lines.push(`${missing} archivos aparecen en las fichas pero no venían dentro del .apkg.`);
    if (failed) lines.push(`${failed} archivos no se pudieron subir${driveStopped ? ' (Google Drive se desconectó)' : ''}.`);
    if (p.extraMedia) lines.push(`${p.extraMedia} imágenes/audios extra no se importaron (solo se guarda 1 imagen y 1 audio por lado).`);
    if (p.skipped) lines.push(`${p.skipped} tarjetas vacías se omitieron.`);

    setReport(lines);
    setStatus('');
    setProgress(null);
    setPending(null);
    setDriveIssue(null);
    onImportSuccess?.();
  }

  async function continueImport(connectFirst: boolean) {
    if (!pending) return;
    setLoading(true);
    setError('');
    try {
      if (connectFirst) await connectDrive(); // debe ejecutarse directamente desde el clic
      setDriveIssue(null);
      await runImport(pending, connectFirst);
    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Ocurrió un problema durante la importación.');
      setStatus('');
    } finally {
      setLoading(false);
    }
  }

  const cancel = () => {
    setPending(null);
    setDriveIssue(null);
    setStatus('');
  };

  const field =
    'w-20 rounded-xl border-2 border-slate-200 bg-transparent px-2 py-1 text-center font-bold outline-none focus:border-sky-400 dark:border-slate-600';

  return (
    <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h3 className="text-base font-extrabold text-slate-800 dark:text-white">Importar mazo .apkg (Anki)</h3>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
        Se importan los mazos, el frente y el reverso de cada tarjeta, y las imágenes y audios (a tu Google Drive).
      </p>

      <div className="space-y-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        <label className="flex items-center gap-2">
          <input type="number" min={1} max={500} value={newPerDay} onChange={(e) => setNewPerDay(e.target.value)} disabled={loading} className={field} />
          fichas nuevas por día (se puede cambiar luego en cada mazo)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={keepProgress} onChange={(e) => setKeepProgress(e.target.checked)} disabled={loading} className="h-4 w-4" />
          Conservar el progreso de Anki (si el mazo ya se había estudiado)
        </label>
      </div>

      <label className="inline-flex cursor-pointer items-center rounded-2xl bg-sky-500 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-sky-600">
        {loading ? 'Procesando…' : 'Seleccionar .apkg'}
        <input type="file" accept=".apkg" onChange={handleFileUpload} disabled={loading || !!pending} className="hidden" />
      </label>

      {driveIssue && pending && (
        <div className="space-y-2 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p>
            Este mazo trae {pending.mediaNames.size} imágenes/audios.{' '}
            {driveIssue.needsConnect ? 'Para guardarlos hay que conectar tu Google Drive.' : `No se pudo usar Google Drive: ${driveIssue.message}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {driveIssue.needsConnect && (
              <button onClick={() => void continueImport(true)} disabled={loading} className="rounded-xl bg-sky-500 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50">
                Conectar Drive y continuar
              </button>
            )}
            <button onClick={() => void continueImport(false)} disabled={loading} className="rounded-xl border-2 border-amber-400 px-3 py-2 text-xs font-extrabold disabled:opacity-50">
              Importar sin multimedia
            </button>
            <button onClick={cancel} disabled={loading} className="rounded-xl px-3 py-2 text-xs font-extrabold disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {status && <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{status}</p>}
      {progress && (
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
        </div>
      )}
      {error && <p className="text-sm font-bold text-red-500">{error}</p>}
      {report.length > 0 && (
        <ul className="space-y-1 text-sm font-bold text-green-700 dark:text-green-400">
          {report.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
