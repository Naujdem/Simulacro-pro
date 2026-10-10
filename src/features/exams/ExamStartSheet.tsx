import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchExamWrongQuestions, type Exam } from './api';
import { usePractice } from '@/features/practice/practiceStore';
import { clearProgress, pendingProgress, setLastSlot } from '@/features/practice/progress';

interface Props {
  exam: Exam;
  onClose: () => void;
}

const card = 'space-y-2 rounded-2xl border-2 border-slate-200 p-3 dark:border-slate-700';
const primary = 'w-full rounded-xl bg-sky-500 py-3 text-sm font-extrabold text-white disabled:opacity-50';
const secondary = 'w-full rounded-xl border-2 border-slate-300 py-2.5 text-sm font-bold dark:border-slate-600';

/**
 * Se abre al tocar un simulacro: elegir entre practicarlo completo o repasar solo las preguntas que marcaste
 * como "Mal" en ESE simulacro. Si dejaste una sesión a medias, ofrece continuarla.
 */
export default function ExamStartSheet({ exam, onClose }: Props) {
  const nav = useNavigate();
  const wrong = useQuery({ queryKey: ['exam-wrong', exam.id], queryFn: () => fetchExamWrongQuestions(exam.id) });
  const pendingFull = useMemo(() => pendingProgress(exam.id, 'full'), [exam.id]);
  const pendingWrong = useMemo(() => pendingProgress(exam.id, 'wrong'), [exam.id]);
  const wrongCount = wrong.data?.length ?? 0;

  // Continuar: la página de práctica retoma el avance guardado de esa sesión
  const go = (slot: string) => {
    setLastSlot(exam.id, slot);
    usePractice.getState().reset();
    nav(`/practice/${exam.id}`);
  };

  const startFull = () => {
    clearProgress(exam.id, 'full');
    go('full'); // sin avance guardado, la página carga las preguntas y empieza de cero
  };

  const startWrong = () => {
    if (!wrong.data?.length) return;
    usePractice.getState().reset();
    // 'custom': no da bono por completar ni cuenta para "mejor %"
    usePractice.getState().start(exam.id, wrong.data, 'custom', undefined, 'wrong');
    nav(`/practice/${exam.id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Practicar ${exam.title}`}
        className="max-h-[90dvh] w-full max-w-sm space-y-3 overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-extrabold leading-tight">{exam.title}</h2>
          <p className="text-xs text-slate-500">
            {exam.subject ?? 'Sin tema'} · {exam.question_count} preguntas
          </p>
        </div>

        <div className={card}>
          <p className="font-extrabold">📝 Simulacro completo</p>
          <p className="text-xs text-slate-500">Todas las preguntas del simulacro.</p>
          {pendingFull ? (
            <>
              <button onClick={() => go('full')} className={primary}>
                ▶ Continuar (pregunta {pendingFull.done + 1} de {pendingFull.total})
              </button>
              <button onClick={startFull} className={secondary}>
                Empezar de nuevo
              </button>
            </>
          ) : (
            <button onClick={startFull} className={primary}>
              Practicar simulacro completo
            </button>
          )}
        </div>

        <div className={card}>
          <p className="font-extrabold">🔁 Repaso de preguntas que tengo mal</p>
          <p className="text-xs text-slate-500">
            {wrong.isLoading
              ? 'Buscando…'
              : wrongCount
                ? `${wrongCount} ${wrongCount === 1 ? 'pregunta marcada' : 'preguntas marcadas'} como “Mal” en este simulacro.`
                : 'Todavía no marcaste ninguna como “Mal” en este simulacro.'}
          </p>
          {pendingWrong && (
            <button onClick={() => go('wrong')} className={primary}>
              ▶ Continuar repaso (pregunta {pendingWrong.done + 1} de {pendingWrong.total})
            </button>
          )}
          <button
            onClick={startWrong}
            disabled={!wrongCount}
            className={pendingWrong ? secondary + ' disabled:opacity-50' : primary}
          >
            {pendingWrong ? 'Empezar el repaso de nuevo' : `Repasar las que tengo mal${wrongCount ? ` (${wrongCount})` : ''}`}
          </button>
          {wrong.isError && <p className="text-xs text-red-600">{(wrong.error as Error).message}</p>}
        </div>

        <button onClick={onClose} className="w-full py-2 text-sm font-bold text-slate-500">
          Cancelar
        </button>
      </div>
    </div>
  );
}
