import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import AuthPage from '@/features/auth/AuthPage';
import { connectDrive, copyDriveFile, driveConnected, preloadGis, DriveError } from '@/lib/drive';
import {
  copyAllMedia,
  copyFolderMessage,
  countExamsIn,
  folderContents,
  folderTrail,
  MANY_FILES,
  MANY_FILES_MSG,
  type CopyOutcome,
} from './shareLogic';
import { copySharedFolder, fetchSharedFolder, fetchSharedFolderMedia, type SharedFolder } from './api';
import SharedExamPage, { RETURN_KEY } from './SharedExamPage';

type SaveState =
  | { s: 'idle' }
  | { s: 'checking' }
  | { s: 'needDrive'; total: number }
  | { s: 'copying'; done: number; total: number }
  | { s: 'saving' }
  | { s: 'ok'; msg: string; warn: boolean }
  | { s: 'error'; msg: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Pantalla pública /b/:shortId: se recorre la biblioteca y se hacen sus simulacros sin cuenta; con cuenta se guarda una copia de toda la biblioteca. */
export default function SharedFolderPage({ session, sessionLoading }: { session: Session | null; sessionLoading: boolean }) {
  const { shortId = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [data, setData] = useState<SharedFolder | null | undefined>(undefined); // undefined = cargando, null = no existe
  const [loadError, setLoadError] = useState('');
  const [current, setCurrent] = useState<string | null>(null); // carpeta que se está viendo (null = la biblioteca raíz)
  const [openExam, setOpenExam] = useState<string | null>(null);
  const [wantsAuth, setWantsAuth] = useState(false);
  const [save, setSave] = useState<SaveState>({ s: 'idle' });
  const [refs, setRefs] = useState<string[]>([]); // archivos por copiar (se conocen al pulsar «Guardar»)

  useEffect(() => {
    void preloadGis().catch(() => undefined);
    let alive = true;
    fetchSharedFolder(shortId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && (setLoadError((e as Error).message), setData(null)));
    return () => {
      alive = false;
    };
  }, [shortId]);

  const here = current ?? data?.folder.id ?? '';
  const view = useMemo(() => (data ? folderContents(data.folders, data.exams, here) : { folders: [], exams: [] }), [data, here]);
  const trail = useMemo(() => (data && current ? folderTrail(data.folders, current) : []), [data, current]);

  if (wantsAuth && !session) return <AuthPage />;
  if (data === undefined) return <p className="p-6 text-center text-slate-500">Cargando…</p>;
  if (data === null) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-8 text-center">
        <p className="text-4xl">🔗</p>
        <h1 className="text-xl font-extrabold">Este enlace no está disponible</h1>
        <p className="text-sm text-slate-500">{loadError || 'No existe o su dueño lo desactivó.'}</p>
        <Link to="/" className="inline-block rounded-xl bg-sky-500 px-5 py-3 font-extrabold text-white">
          Ir a SimulaPro
        </Link>
      </div>
    );
  }

  // Un simulacro de la biblioteca: misma pantalla de hacerlo que un enlace de simulacro, con botón para volver
  if (openExam) {
    return (
      <SharedExamPage
        key={openExam}
        session={session}
        sessionLoading={sessionLoading}
        folderShare={{ shortId, examId: openExam, onBack: () => setOpenExam(null) }}
      />
    );
  }

  const totalExams = data.exams.length;

  /* ───────── Guardar toda la biblioteca en mi cuenta ───────── */
  const runCopy = async (files: string[]) => {
    try {
      let outcome: CopyOutcome = { map: {}, total: 0, copied: 0, failed: [] };
      if (files.length) {
        setSave({ s: 'copying', done: 0, total: files.length });
        outcome = await copyAllMedia(files, (r) => copyDriveFile(r, shortId), (done, total) => setSave({ s: 'copying', done, total }));
      }
      setSave({ s: 'saving' });
      await copySharedFolder(shortId, outcome.map);
      void qc.invalidateQueries({ queryKey: ['folders'] });
      void qc.invalidateQueries({ queryKey: ['exams'] });
      const m = copyFolderMessage(outcome, totalExams);
      setSave({ s: 'ok', msg: m.text, warn: m.warn });
    } catch (e) {
      setSave({ s: 'error', msg: (e as Error).message });
    }
  };

  const onSave = async () => {
    if (!session) {
      try {
        localStorage.setItem(RETURN_KEY, `/b/${shortId}`); // tras registrarse (incluso con Google) vuelve aquí
      } catch {
        /* sin almacenamiento: se vuelve a abrir el enlace a mano */
      }
      setWantsAuth(true);
      return;
    }
    try {
      setSave({ s: 'checking' });
      const files = await fetchSharedFolderMedia(shortId);
      setRefs(files);
      if (!files.length) return runCopy([]);
      if (!(await driveConnected())) return setSave({ s: 'needDrive', total: files.length });
      return runCopy(files);
    } catch (e) {
      return setSave({ s: 'error', msg: (e as Error).message });
    }
  };

  const onConnect = async () => {
    try {
      await connectDrive(); // se llama directo desde el clic: así el navegador no bloquea la ventana de Google
    } catch (e) {
      return setSave({ s: 'error', msg: e instanceof DriveError ? e.message : (e as Error).message });
    }
    return runCopy(refs);
  };

  const busy = save.s === 'checking' || save.s === 'copying' || save.s === 'saving';
  const manyFiles = (save.s === 'needDrive' ? save.total : refs.length) > MANY_FILES;
  const saveBox = (
    <div className="space-y-2">
      {save.s === 'ok' ? (
        <div role="status" className={`space-y-2 rounded-2xl p-4 text-center text-sm font-bold ${save.warn ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'}`}>
          <p>{save.msg}</p>
          <button onClick={() => nav('/library')} className="rounded-xl bg-green-600 px-5 py-2 font-extrabold text-white">
            Ir a mi biblioteca
          </button>
        </div>
      ) : (
        <>
          {manyFiles && save.s !== 'copying' && save.s !== 'idle' && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">⚠️ {MANY_FILES_MSG}</p>
          )}
          {save.s === 'needDrive' ? (
            <div className="space-y-2 rounded-2xl border-2 border-amber-300 p-3 text-sm">
              <p>
                Esta biblioteca tiene {plural(save.total, 'archivo', 'archivos')} (imágenes/audios). Para copiarlos hay que conectar tu Google Drive: se guardan en tu carpeta «SimulaPro».
              </p>
              <button onClick={onConnect} className="w-full rounded-xl bg-sky-500 py-3 font-extrabold text-white">
                Conectar Google Drive y guardar
              </button>
              <button onClick={() => runCopy([])} className="w-full rounded-xl border-2 border-slate-300 py-2.5 text-sm font-bold dark:border-slate-600">
                Guardar sin imágenes ni audios
              </button>
            </div>
          ) : (
            <button
              disabled={busy || sessionLoading}
              onClick={onSave}
              className="w-full rounded-2xl bg-green-600 py-4 font-extrabold uppercase text-white disabled:opacity-60"
            >
              {save.s === 'checking'
                ? 'Revisando…'
                : save.s === 'copying'
                  ? `Copiando archivos ${save.done} de ${save.total}…`
                  : save.s === 'saving'
                    ? 'Guardando…'
                    : session
                      ? '💾 Guardar biblioteca en mi cuenta'
                      : 'Regístrate para guardar'}
            </button>
          )}
          {save.s === 'error' && <p className="text-center text-xs text-red-600">{save.msg}</p>}
        </>
      )}
    </div>
  );

  /* ───────── Recorrer la biblioteca ───────── */
  const shownName = trail.length ? trail[trail.length - 1].name : data.folder.name;
  const shownColor = (trail.length ? trail[trail.length - 1].color : data.folder.color) ?? '#0ea5e9';
  const nExams = countExamsIn(data.folders, data.exams, here);

  return (
    <div className="mx-auto max-w-xl space-y-5 p-6">
      <header className="space-y-1">
        <p className="text-xs font-extrabold uppercase tracking-wide text-sky-500">Biblioteca compartida</p>
        <div className="h-2 w-16 rounded-full" style={{ backgroundColor: shownColor }} />
        {current && (
          <nav aria-label="Ruta" className="flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
            <button onClick={() => setCurrent(null)} className="hover:text-sky-600 hover:underline">
              {data.folder.name}
            </button>
            {trail.slice(0, -1).map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <span aria-hidden="true">›</span>
                <button onClick={() => setCurrent(f.id)} className="hover:text-sky-600 hover:underline">
                  {f.name}
                </button>
              </span>
            ))}
            <span aria-hidden="true">›</span>
          </nav>
        )}
        <h1 className="text-2xl font-extrabold leading-tight">{shownName}</h1>
        {!current && data.folder.description && <p className="text-sm text-slate-600 dark:text-slate-300">{data.folder.description}</p>}
        <p className="text-xs text-slate-500">
          {plural(nExams, 'simulacro', 'simulacros')}
          {view.folders.length > 0 && ` · ${plural(view.folders.length, 'subbiblioteca', 'subbibliotecas')}`}
        </p>
        {current && (
          <button onClick={() => setCurrent(trail.length > 1 ? trail[trail.length - 2].id : null)} className="text-sm font-bold text-sky-500">
            ← Subir un nivel
          </button>
        )}
      </header>

      {view.folders.length > 0 && (
        <section>
          <h2 className="section-title mb-2">Subbibliotecas</h2>
          <div className="grid grid-cols-2 gap-3">
            {view.folders.map((f) => {
              const n = countExamsIn(data.folders, data.exams, f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => setCurrent(f.id)}
                  className="card h-full w-full p-5 text-left transition active:scale-[.98] md:hover:bg-slate-50 md:dark:hover:bg-slate-700/60"
                >
                  <span className="mb-3 block h-1.5 w-9 rounded-full" style={{ backgroundColor: f.color ?? '#0ea5e9' }} />
                  <p className="line-clamp-2 text-lg font-semibold leading-tight">{f.name}</p>
                  <p className="mt-1.5 text-sm text-slate-500">{plural(n, 'simulacro', 'simulacros')}</p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {view.exams.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">Simulacros</h2>
          <ul className="grid grid-cols-1 gap-2.5">
            {view.exams.map((e) => (
              <li key={e.id}>
                <button onClick={() => setOpenExam(e.id)} className="card flex w-full items-center gap-3 p-4 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {e.subject ?? 'Sin tema'} · {plural(e.question_count, 'pregunta', 'preguntas')}
                      {e.time_limit_min ? ` · ${e.time_limit_min} min` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-extrabold text-sky-500">▶ Hacer</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!view.folders.length && !view.exams.length && (
        <p className="rounded-2xl bg-slate-100 p-4 text-center text-sm text-slate-500 dark:bg-slate-800">Esta carpeta está vacía.</p>
      )}

      {data.is_owner ? (
        <p className="rounded-xl bg-slate-100 p-3 text-center text-sm text-slate-500 dark:bg-slate-800">Esta es tu biblioteca: así la ve quien abre el enlace.</p>
      ) : (
        totalExams > 0 && (
          <div className="space-y-2 border-t border-slate-200/70 pt-4 dark:border-slate-800">
            <p className="text-center text-xs text-slate-500">
              Se guarda toda la biblioteca ({plural(totalExams, 'simulacro', 'simulacros')}), con sus subbibliotecas.
            </p>
            {saveBox}
          </div>
        )
      )}
      {!session && !sessionLoading && <p className="text-center text-xs text-slate-500">Con una cuenta gratuita puedes guardar tu propia copia y practicarla cuando quieras.</p>}
      {session && (
        <Link to="/" className="block text-center text-sm font-bold text-sky-500">
          ← Ir a mi inicio
        </Link>
      )}
    </div>
  );
}
