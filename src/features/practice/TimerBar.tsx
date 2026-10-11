import { formatClock } from '@/lib/timer';

/** Barra fija arriba con el tiempo que queda del Examen Cronometrado. Se pone roja el último minuto. */
export default function TimerBar({ remaining, limitSec }: { remaining: number; limitSec: number }) {
  const low = remaining <= 60;
  return (
    <div
      role="timer"
      aria-label={`${formatClock(remaining)} restantes`}
      className={`sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-2 text-sm font-bold text-white ${
        low ? 'bg-red-600' : 'bg-slate-800 dark:bg-slate-700'
      }`}
    >
      <span>⏱ Examen cronometrado</span>
      <span className="tabular-nums" data-testid="clock">
        {formatClock(remaining)} restantes
      </span>
      <span className="sr-only">de {Math.round(limitSec / 60)} minutos</span>
    </div>
  );
}
