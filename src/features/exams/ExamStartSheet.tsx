import { useEffect, useMemo, useState } from 'react';
import ShareDialog from '@/features/share/ShareDialog';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/Icon';
import { fetchExamWrongQuestions, type Exam } from './api';
import { usePractice } from '@/features/practice/practiceStore';
import { clearProgress, pendingProgress, setLastSlot } from '@/features/practice/progress';
import { syncProgress, useProgressVersion } from '@/features/practice/progressSync';
import { loadShuffleOptions, saveShuffleOptions } from '@/lib/shuffle';

interface Props {
  exam: Exam;
  onClose: () => void;
}

/**
 * Se abre al tocar un simulacro: elegir entre practicarlo completo o repasar solo las preguntas que marcaste
 * como "Mal" en ESE simulacro. Si dejaste una sesión a medias, ofrece continuarla.
 */
export default function ExamStartSheet({ exam, onClose }: Props) {
  const nav = useNavigate();
  const wrong = useQuery({ queryKey: ['exam-wrong', exam.id], queryFn: () => fetchExamWrongQuestions(exam.id) });
  const version = useProgressVersion((s) => s.version); // cambia cuando llega avance de otro dispositivo
  useEffect(() => {
    void syncProgress();
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pendingFull = useMemo(() => pendingProgress(exam.id, 'full'), [exam.id, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pendingWrong = useMemo(() => pendingProgress(exam.id, 'wrong'), [exam.id, version]);
  const wrongCount = wrong.data?.length ?? 0;
  const [sharing, setSharing] = useState(false);
  const [shuffle, setShuffle] = useState(loadShuffleOptions);

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
        className="max-h-[90dvh] w-full max-w-sm animate-slideUp space-y-5 overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold leading-tight">{exam.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {exam.subject ?? 'Sin tema'} · {exam.question_count} preguntas{exam.difficulty ? ` · ★ ${exam.difficulty}` : ''}
          </p>
          {exam.description && <p className="mt-2 line-clamp-3 text-sm text-slate-500">{exam.description}</p>}
        </div>

        <div className="space-y-2">
          <p className="section-title flex items-center gap-1.5">
            <Icon name="file" size={14} /> Simulacro completo
          </p>
          {exam.time_limit_min ? (
            <p className="flex items-start gap-1.5 text-xs text-slate-500">
              <Icon name="clock" size={14} className="mt-px shrink-0 text-amber-500" />
              <span>
                Cronometrado: {exam.time_limit_min} minutos. Al acabarse el tiempo se cierra solo y las preguntas sin responder cuentan como
                incorrectas.
              </span>
            </p>
          ) : (
            <p className="text-xs text-slate-500">Todas las preguntas del simulacro.</p>
          )}
          {pendingFull ? (
            <>
              <button onClick={() => go('full')} className="btn-primary w-full">
                <Icon name="play" size={14} /> Continuar (pregunta {pendingFull.done + 1} de {pendingFull.total})
              </button>
              <button onClick={startFull} className="btn-ghost w-full">
                Empezar de nuevo
              </button>
            </>
          ) : (
            <button onClick={startFull} className="btn-primary w-full">
              {exam.time_limit_min ? 'Empezar examen cronometrado' : 'Practicar simulacro completo'}
            </button>
          )}
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-700">
          <p className="section-title flex items-center gap-1.5">
            <Icon name="repeat" size={14} /> Repaso de las que tengo mal
          </p>
          <p className="text-xs text-slate-500">
            {wrong.isLoading
              ? 'Buscando…'
              : wrongCount
                ? `${wrongCount} ${wrongCount === 1 ? 'pregunta marcada' : 'preguntas marcadas'} como “Mal” en este simulacro.`
                : 'Todavía no marcaste ninguna como “Mal” en este simulacro.'}
          </p>
          {pendingWrong && (
            <button onClick={() => go('wrong')} className="btn-secondary w-full">
              <Icon name="play" size={14} /> Continuar repaso (pregunta {pendingWrong.done + 1} de {pendingWrong.total})
            </button>
          )}
          <button onClick={startWrong} disabled={!wrongCount} className={pendingWrong ? 'btn-ghost w-full' : 'btn-secondary w-full'}>
            {pendingWrong ? 'Empezar el repaso de nuevo' : `Repasar las que tengo mal${wrongCount ? ` (${wrongCount})` : ''}`}
          </button>
          {wrong.isError && <p className="text-xs text-red-600">{(wrong.error as Error).message}</p>}
        </div>

        <label className="flex cursor-pointer items-start gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
          <input
            type="checkbox"
            checked={shuffle}
            onChange={(e) => {
              setShuffle(e.target.checked);
              saveShuffleOptions(e.target.checked);
            }}
            className="mt-1 h-4 w-4 accent-sky-500"
          />
          <span className="text-sm">
            <b>🔀 Mezclar las opciones</b>
            <span className="block text-xs text-slate-500">
              La respuesta correcta cambia de lugar cada vez que abres la pregunta. Aplica a todos tus simulacros.
            </span>
          </span>
        </label>

        <button onClick={() => setSharing(true)} className="btn-secondary w-full">
          🔗 Compartir
        </button>

        <button onClick={onClose} className="btn-ghost w-full">
          Cancelar
        </button>
        {sharing && <ShareDialog examId={exam.id} title={exam.title} onClose={() => setSharing(false)} />}
      </div>
    </div>
  );
}
