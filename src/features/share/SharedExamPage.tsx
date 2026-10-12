import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AuthPage from '@/features/auth/AuthPage';
import { QuestionCard } from '@/features/practice/QuestionCard';
import { correctText, type Response } from '@/lib/grading';
import { connectDrive, copyDriveFile, driveConnected, preloadGis, setShareContext, DriveError } from '@/lib/drive';
import { collectMediaRefs, copyAllMedia, copyMessage, MANY_FILES, MANY_FILES_MSG, type CopyOutcome } from './shareLogic';
import { copySharedExam, fetchShared, type SharedExam } from './api';

export const RETURN_KEY = 'simulapro:return-to';
const showPrompt = (p: string) => p.replace(/\{\{\d+\}\}/g, '____');

type Phase = 'intro' | 'running' | 'done';
type SaveState =
  | { s: 'idle' }
  | { s: 'needDrive' }
  | { s: 'copying'; done: number; total: number }
  | { s: 'saving' }
  | { s: 'ok'; msg: string; warn: boolean }
  | { s: 'error'; msg: string };

/** Pantalla pública /s/:shortId: se puede ver y hacer sin cuenta; con cuenta se guarda una copia. */
export default function SharedExamPage({ session, sessionLoading }: { session: Session | null; sessionLoading: boolean }) {
  const { shortId = '' } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<SharedExam | null | undefined>(undefined); // undefined = cargando, null = no existe
  const [loadError, setLoadError] = useState('');
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ correct: boolean }[]>([]);
  const [wantsAuth, setWantsAuth] = useState(false);
  const [save, setSave] = useState<SaveState>({ s: 'idle' });

  useEffect(() => {
    setShareContext(shortId); // las imágenes se piden al enlace, no al Drive de quien mira
    void preloadGis().catch(() => undefined);
    let alive = true;
    fetchShared(shortId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && (setLoadError((e as Error).message), setData(null)));
    return () => {
      alive = false;
      setShareContext(null);
    };
  }, [shortId]);

  const refs = useMemo(() => (data ? collectMediaRefs(data.questions) : []), [data]);
  const readings = useMemo(() => new Map((data?.readings ?? []).map((r) => [r.id, r])), [data]);

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

  const total = data.questions.length;
  const question = data.questions[index];

  /* ───────── Guardar en mi cuenta ───────── */
  const runCopy = async (withMedia: boolean) => {
    try {
      let outcome: CopyOutcome = { map: {}, total: 0, copied: 0, failed: [] };
      if (withMedia && refs.length) {
        setSave({ s: 'copying', done: 0, total: refs.length });
        outcome = await copyAllMedia(refs, (r) => copyDriveFile(r, shortId), (done, t) => setSave({ s: 'copying', done, total: t }));
      }
      setSave({ s: 'saving' });
      await copySharedExam(shortId, outcome.map);
      const m = copyMessage(outcome);
      setSave({ s: 'ok', msg: m.text, warn: m.warn });
    } catch (e) {
      setSave({ s: 'error', msg: (e as Error).message });
    }
  };

  const onSave = async () => {
    if (!session) {
      try {
        localStorage.setItem(RETURN_KEY, `/s/${shortId}`); // tras registrarse (incluso con Google) vuelve aquí
      } catch {
        /* sin almacenamiento: se vuelve a abrir el enlace a mano */
      }
      setWantsAuth(true);
      return;
    }
    if (!refs.length) return runCopy(false);
    try {
      if (!(await driveConnected())) return setSave({ s: 'needDrive' });
    } catch (e) {
      return setSave({ s: 'error', msg: (e as Error).message });
    }
    return runCopy(true);
  };

  const onConnect = async () => {
    try {
      await connectDrive(); // se llama directo desde el clic: así el navegador no bloquea la ventana de Google
    } catch (e) {
      return setSave({ s: 'error', msg: e instanceof DriveError ? e.message : (e as Error).message });
    }
    return runCopy(true);
  };

  const busy = save.s === 'copying' || save.s === 'saving';
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
          {refs.length > MANY_FILES && save.s !== 'copying' && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">⚠️ {MANY_FILES_MSG}</p>
          )}
          {save.s === 'needDrive' ? (
            <div className="space-y-2 rounded-2xl border-2 border-amber-300 p-3 text-sm">
              <p>
                Este simulacro tiene {refs.length} {refs.length === 1 ? 'archivo' : 'archivos'} (imágenes/audios). Para copiarlos hay que conectar tu Google Drive: se guardan en tu carpeta «SimulaPro».
              </p>
              <button onClick={onConnect} className="w-full rounded-xl bg-sky-500 py-3 font-extrabold text-white">
                Conectar Google Drive y guardar
              </button>
              <button onClick={() => runCopy(false)} className="w-full rounded-xl border-2 border-slate-300 py-2.5 text-sm font-bold dark:border-slate-600">
                Guardar sin imágenes ni audios
              </button>
            </div>
          ) : (
            <button
              disabled={busy || sessionLoading}
              onClick={onSave}
              className="w-full rounded-2xl bg-green-600 py-4 font-extrabold uppercase text-white disabled:opacity-60"
            >
              {save.s === 'copying'
                ? `Copiando archivos ${save.done} de ${save.total}…`
                : save.s === 'saving'
                  ? 'Guardando…'
                  : session
                    ? '💾 Guardar en mi cuenta'
                    : 'Regístrate para guardar'}
            </button>
          )}
          {save.s === 'copying' && refs.length > MANY_FILES && <p className="text-center text-xs text-slate-500">{MANY_FILES_MSG}</p>}
          {save.s === 'error' && <p className="text-center text-xs text-red-600">{save.msg}</p>}
        </>
      )}
    </div>
  );

  /* ───────── Hacerlo ───────── */
  if (phase === 'running' && question) {
    return (
      <div className="min-h-dvh">
        <header className="mx-auto flex max-w-xl items-center gap-3 px-4 pt-4">
          <button aria-label="Salir" onClick={() => setPhase('intro')} className="text-2xl text-slate-400">
            ✕
          </button>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${(index / total) * 100}%` }} />
          </div>
          <span className="text-sm font-bold text-slate-500">
            {index + 1}/{total}
          </span>
        </header>
        <QuestionCard
          key={question.id}
          question={question}
          examId={shortId}
          anonymous
          reading={question.reading_id ? readings.get(question.reading_id) ?? null : null}
          onNext={(_r: Response, correct: boolean) => {
            setResults((rs) => [...rs, { correct }]);
            if (index + 1 >= total) setPhase('done');
            else setIndex(index + 1);
          }}
        />
      </div>
    );
  }

  /* ───────── Resultado ───────── */
  if (phase === 'done') {
    const ok = results.filter((r) => r.correct).length;
    const pct = total ? Math.round((ok / total) * 100) : 0;
    const wrong = data.questions.map((q, i) => ({ q, correct: results[i]?.correct })).filter((x) => x.correct === false);
    return (
      <div className="mx-auto max-w-xl space-y-5 p-6">
        <h1 className="text-center text-2xl font-extrabold">{pct >= 70 ? '¡Buen trabajo! 🎉' : 'Sigue practicando 💪'}</h1>
        <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full text-4xl font-extrabold" style={{ background: `conic-gradient(#22c55e ${pct * 3.6}deg, #e2e8f0 0deg)` }}>
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-900">{pct}%</div>
        </div>
        <p className="text-center text-sm text-slate-500">
          {ok} de {total} correctas
        </p>
        {saveBox}
        <button
          onClick={() => {
            setResults([]);
            setIndex(0);
            setPhase('running');
          }}
          className="w-full rounded-2xl border-2 border-slate-300 py-3 font-bold dark:border-slate-600"
        >
          Hacerlo otra vez
        </button>
        {wrong.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-extrabold">Para repasar</h2>
            <ul className="space-y-2">
              {wrong.map(({ q }) => (
                <li key={q.id} className="space-y-1 rounded-xl bg-red-100 p-3 text-sm dark:bg-red-950">
                  <p>✖ {showPrompt(q.prompt)}</p>
                  <p className="text-xs">
                    Respuesta correcta: <b>{correctText(q)}</b>
                  </p>
                  {q.explanation && <p className="text-xs">📖 {q.explanation}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  /* ───────── Presentación ───────── */
  return (
    <div className="mx-auto max-w-xl space-y-5 p-6">
      <header className="space-y-1">
        <p className="text-xs font-extrabold uppercase tracking-wide text-sky-500">Simulacro compartido</p>
        <h1 className="text-2xl font-extrabold leading-tight">{data.exam.title}</h1>
        {data.exam.description && <p className="text-sm text-slate-600 dark:text-slate-300">{data.exam.description}</p>}
        <p className="text-xs text-slate-500">
          {data.exam.subject ?? 'Sin tema'} · {total} {total === 1 ? 'pregunta' : 'preguntas'}
          {data.readings.length ? ` · ${data.readings.length} ${data.readings.length === 1 ? 'lectura' : 'lecturas'}` : ''}
        </p>
      </header>

      {total > 0 ? (
        <button onClick={() => setPhase('running')} className="w-full rounded-2xl bg-sky-500 py-4 font-extrabold uppercase text-white">
          ▶ Hacerlo ahora
        </button>
      ) : (
        <p className="rounded-xl bg-slate-100 p-3 text-center text-sm text-slate-500 dark:bg-slate-800">Este simulacro todavía no tiene preguntas.</p>
      )}

      {data.is_owner ? (
        <p className="rounded-xl bg-slate-100 p-3 text-center text-sm text-slate-500 dark:bg-slate-800">Este es tu simulacro: así lo ve quien abre el enlace.</p>
      ) : (
        total > 0 && saveBox
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
