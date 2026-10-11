import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchReadings } from '@/features/exams/api';
import type { Question } from '@/lib/grading';
import { isMixedSession, QUICK_REVIEW_ID, SURPRISE_ID, usePractice } from './practiceStore';
import TimerBar from './TimerBar';
import { remainingSec } from '@/lib/timer';
import { lastSlotFor } from './progress';
import { QuestionCard } from './QuestionCard';
import SectionPause from './SectionPause';
import { boundaryAt, sectionRanges, sectionStats } from '@/lib/sections';

export default function PracticePage() {
  const { examId } = useParams();
  const nav = useNavigate();
  const { active, examId: current, mode, queue, index, record, results, ack, continueSection, limitSec, startedAt } = usePractice();
  const finishing = useRef(false);
  const [resumedAt, setResumedAt] = useState<number | null>(null);

  // Al abrir (o recargar) el simulacro: continúa el avance guardado; si no hay, carga las preguntas desde cero.
  // Si venimos de "Repetir" o de un botón "Empezar", la sesión ya está en memoria y no se hace nada.
  useEffect(() => {
    const s = usePractice.getState();
    if (s.active && s.examId === examId) return;
    let cancelled = false;

    (async () => {
      const slot = lastSlotFor(examId!) ?? (examId === QUICK_REVIEW_ID ? 'quick_review' : examId === SURPRISE_ID ? 'surprise' : 'full');
      const resumed = await usePractice.getState().resume(examId!, slot).catch(() => false);
      if (cancelled) return;
      if (resumed) {
        setResumedAt(usePractice.getState().index + 1);
        return;
      }

      // El Repaso Rápido y el Sorpresa no se pueden reconstruir sin avance guardado: vuelve al inicio
      if (isMixedSession(examId!)) {
        nav('/', { replace: true });
        return;
      }
      const { data } = await supabase.from('questions').select('*').eq('exam_id', examId!).order('position');
      if (cancelled) return;
      if (!data?.length) return nav('/library');
      // Examen cronometrado: el tiempo límite lo define el simulacro
      const { data: ex } = await supabase.from('exams').select('time_limit_min').eq('id', examId!).maybeSingle();
      if (cancelled) return;
      const limit = ex?.time_limit_min ? Number(ex.time_limit_min) * 60 : null;
      usePractice.getState().start(examId!, data as Question[], 'full', undefined, 'full', limit);
    })();

    return () => {
      cancelled = true;
    };
  }, [examId, nav]);

  // Textos de lectura de las preguntas de esta sesión (comprensión lectora)
  const readingIds = [...new Set(queue.map((q) => q.reading_id).filter((x): x is string => !!x))];
  const readings = useQuery({
    queryKey: ['readings', readingIds.join(',')],
    queryFn: () => fetchReadings(readingIds),
    enabled: readingIds.length > 0,
    staleTime: Infinity,
  });

  // Secciones: solo el simulacro completo se hace por secciones (los repasos mezclan preguntas)
  const ranges = useMemo(() => (mode === 'full' ? sectionRanges(queue) : []), [mode, queue]);
  const [finishingNow, setFinishingNow] = useState(false);

  // "Terminar aquí": guarda lo respondido hasta ahora como resultado parcial
  const finishHere = () => {
    if (finishing.current) return;
    finishing.current = true;
    setFinishingNow(true);
    usePractice
      .getState()
      .finish()
      .then(() => nav('/results', { replace: true }))
      .catch((e) => {
        finishing.current = false;
        setFinishingNow(false);
        alert('No se pudo guardar el intento: ' + e.message);
      });
  };

  // El aviso de "continuando…" se quita solo
  useEffect(() => {
    if (resumedAt === null) return;
    const t = setTimeout(() => setResumedAt(null), 4000);
    return () => clearTimeout(t);
  }, [resumedAt]);

  // Examen cronometrado: reloj que corre cada segundo; al llegar a 0 se cierra y se guarda solo
  const [now, setNow] = useState(() => Date.now());
  const [timeUp, setTimeUp] = useState(false);
  const [timeUpError, setTimeUpError] = useState('');
  useEffect(() => {
    if (!active || !limitSec) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active, limitSec]);
  const remaining = limitSec ? remainingSec(startedAt, limitSec, now) : null;
  const saveTimedOut = () => {
    if (finishing.current) return;
    finishing.current = true;
    setTimeUp(true);
    setTimeUpError('');
    usePractice
      .getState()
      .finish({ timedOut: true })
      .then(() => nav('/results', { replace: true }))
      .catch((e) => {
        finishing.current = false;
        setTimeUpError(e.message || 'No se pudo guardar el intento.');
      });
  };
  useEffect(() => {
    if (active && queue.length && remaining === 0 && !finishing.current && !timeUpError) saveTimedOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, queue.length, remaining, timeUpError]);

  // Al terminar la cola: guardar y mostrar resultados
  useEffect(() => {
    if (active && queue.length && index >= queue.length && !finishing.current) {
      finishing.current = true;
      usePractice
        .getState()
        .finish()
        .then(() => nav('/results', { replace: true }))
        .catch((e) => {
          finishing.current = false;
          alert('No se pudo guardar el intento: ' + e.message);
        });
    }
  }, [active, queue.length, index, nav]);

  if (!active || current !== examId || !queue.length) return <p className="p-6">Cargando…</p>;
  if (timeUp) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6 text-center">
        <p className="text-2xl font-bold">⏰ ¡Se acabó el tiempo!</p>
        {timeUpError ? (
          <>
            <p className="text-sm text-red-500">{timeUpError}</p>
            <button onClick={saveTimedOut} className="rounded-2xl bg-sky-500 px-6 py-3 font-bold text-white">
              Reintentar guardar
            </button>
          </>
        ) : (
          <p className="text-slate-500">Guardando tus resultados. Las preguntas sin responder cuentan como incorrectas.</p>
        )}
      </div>
    );
  }
  if (index >= queue.length) return <p className="p-6">Guardando resultados…</p>;

  // Pausa entre secciones: aparece al empezar una sección nueva (y se queda hasta elegir)
  const boundary = boundaryAt(ranges, index);
  const timerBar = limitSec && remaining !== null ? <TimerBar remaining={remaining} limitSec={limitSec} /> : null;
  if (boundary >= 0 && ack !== index) {
    return (
      <>
      {timerBar}
      <SectionPause
        done={sectionStats(ranges[boundary - 1], results)}
        next={{ name: ranges[boundary].name, total: ranges[boundary].end - ranges[boundary].start }}
        nextNumber={boundary + 1}
        sectionCount={ranges.length}
        answered={results.length}
        total={queue.length}
        correct={results.filter((r) => r.correct).length}
        finishing={finishingNow}
        onContinue={continueSection}
        onFinish={finishHere}
        onExit={() => {
          // El avance ya está guardado: al volver a abrir el simulacro vuelves a esta pausa
          usePractice.getState().reset();
          nav('/library');
        }}
      />
      </>
    );
  }
  const currentRange = ranges.find((r) => index >= r.start && index < r.end);

  return (
    <div className="min-h-dvh">
      {timerBar}
      <header className="mx-auto flex max-w-xl items-center gap-3 px-4 pt-4">
        <button
          aria-label="Salir"
          onClick={() => {
            // El avance ya está guardado: al volver a abrir este simulacro puedes continuar donde te quedaste
            usePractice.getState().reset();
            nav('/library');
          }}
          className="text-2xl text-slate-400"
        >
          ✕
        </button>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
        </div>
        <span className="text-sm font-bold text-slate-500">
          {index + 1}/{queue.length}
        </span>
      </header>
      {currentRange && (
        <p className="mx-auto mt-2 max-w-xl px-4 text-xs font-bold text-slate-500">
          {currentRange.name} · {index - currentRange.start + 1}/{currentRange.end - currentRange.start}
        </p>
      )}
      {resumedAt !== null && (
        <p role="status" className="mx-auto mt-3 max-w-xl rounded-xl bg-sky-100 px-4 py-2 text-center text-sm font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
          Continuando donde te quedaste: pregunta {resumedAt}
        </p>
      )}
      {/* En Repaso Rápido cada pregunta guarda su etiqueta en SU simulacro de origen. En los repasos, al fallar se ofrece la ayuda de IA. */}
      <QuestionCard
        key={queue[index].id}
        question={queue[index]}
        examId={queue[index].exam_id ?? examId!}
        onNext={record}
        aiHelp={mode !== 'full'}
        reading={queue[index].reading_id ? readings.data?.[queue[index].reading_id!] ?? null : null}
      />
    </div>
  );
}
