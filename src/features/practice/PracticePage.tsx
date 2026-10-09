import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Question } from '@/lib/grading';
import { QUICK_REVIEW_ID, usePractice } from './practiceStore';
import { QuestionCard } from './QuestionCard';

export default function PracticePage() {
  const { examId } = useParams();
  const nav = useNavigate();
  const { active, examId: current, queue, index, record } = usePractice();
  const finishing = useRef(false);

  // Carga las preguntas si no venimos de "Repetir"
  useEffect(() => {
    const s = usePractice.getState();
    if (s.active && s.examId === examId) return;
    // El Repaso Rápido solo existe en memoria: si se recarga la página, vuelve al inicio
    if (examId === QUICK_REVIEW_ID) {
      nav('/', { replace: true });
      return;
    }
    supabase
      .from('questions')
      .select('*')
      .eq('exam_id', examId!)
      .order('position')
      .then(({ data }) => {
        if (!data?.length) return nav('/library');
        usePractice.getState().start(examId!, data as Question[]);
      });
  }, [examId, nav]);

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
  if (index >= queue.length) return <p className="p-6">Guardando resultados…</p>;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-xl items-center gap-3 px-4 pt-4">
        <button
          aria-label="Salir"
          onClick={() => {
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
      {/* En Repaso Rápido cada pregunta guarda su etiqueta en SU simulacro de origen */}
      <QuestionCard key={queue[index].id} question={queue[index]} examId={queue[index].exam_id ?? examId!} onNext={record} />
    </div>
  );
}
