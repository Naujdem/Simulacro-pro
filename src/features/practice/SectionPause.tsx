import type { SectionStats } from '@/lib/sections';

interface Props {
  /** Sección que acabas de terminar. */
  done: SectionStats;
  /** Sección que sigue. */
  next: { name: string; total: number };
  /** Número de la sección que sigue (1 = primera) y cuántas hay en total. */
  nextNumber: number;
  sectionCount: number;
  /** Progreso de todo el simulacro hasta ahora. */
  answered: number;
  total: number;
  correct: number;
  finishing: boolean;
  onContinue: () => void;
  onFinish: () => void;
  onExit: () => void;
}

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Pausa entre secciones: resultado de la sección que terminaste y qué quieres hacer ahora. */
export default function SectionPause({ done, next, nextNumber, sectionCount, answered, total, correct, finishing, onContinue, onFinish, onExit }: Props) {
  const pct = done.answered ? Math.round((done.correct / done.answered) * 100) : 0;
  const overallPct = answered ? Math.round((correct / answered) * 100) : 0;

  return (
    <div className="mx-auto min-h-dvh max-w-xl space-y-5 p-6">
      <div className="space-y-1 text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Sección {nextNumber - 1} de {sectionCount} completada
        </p>
        <h1 className="text-2xl font-extrabold">☕ {done.name}</h1>
        <p className="text-sm text-slate-500">Buen momento para respirar un poco.</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm" aria-label="Resultado de la sección">
        {[
          ['✔', done.correct, 'Aciertos'],
          ['✖', done.wrong, 'Errores'],
          ['⏱', fmt(done.timeMs), 'Tiempo'],
        ].map(([i, v, l]) => (
          <div key={String(l)} className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800">
            <div>{i}</div>
            <div className="text-xl font-extrabold">{v}</div>
            <div className="text-xs text-slate-500">{l}</div>
          </div>
        ))}
      </div>
      <p className="text-center text-sm font-bold">{pct}% de aciertos en esta sección</p>

      <div className="space-y-2 rounded-2xl border-2 border-slate-200 p-4 dark:border-slate-700">
        <div className="flex justify-between text-sm font-bold">
          <span>Progreso del simulacro</span>
          <span>
            {answered}/{total}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-green-500" style={{ width: `${(answered / total) * 100}%` }} />
        </div>
        <p className="text-xs text-slate-500">
          Llevas {correct} {correct === 1 ? 'acierto' : 'aciertos'} de {answered} {answered === 1 ? 'respondida' : 'respondidas'} ({overallPct}%).
        </p>
      </div>

      <div className="space-y-3">
        <button onClick={onContinue} disabled={finishing} className="w-full rounded-2xl bg-sky-500 py-4 text-base font-extrabold text-white disabled:opacity-50">
          Continuar → {next.name} ({next.total} {next.total === 1 ? 'pregunta' : 'preguntas'})
        </button>
        <button onClick={onFinish} disabled={finishing} className="w-full rounded-2xl border-2 border-slate-300 py-4 font-bold disabled:opacity-50 dark:border-slate-600">
          {finishing ? 'Guardando…' : 'Terminar aquí y ver el resultado parcial'}
        </button>
        <button onClick={onExit} disabled={finishing} className="w-full py-2 text-sm font-bold text-slate-500">
          Salir y continuar después
        </button>
      </div>
    </div>
  );
}
