import { parseMinutes } from '@/lib/timer';

interface Props {
  enabled: boolean;
  minutes: string;
  onChange: (enabled: boolean, minutes: string) => void;
  label?: string;
}

/** Casilla "Este es un examen cronometrado" + minutos. Con la casilla marcada los minutos son obligatorios. */
export default function TimedField({ enabled, minutes, onChange, label = 'Este es un examen cronometrado' }: Props) {
  const invalid = enabled && parseMinutes(minutes) === null;
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <label className="flex items-center gap-3 text-sm font-bold">
        <input
          type="checkbox"
          className="h-5 w-5 accent-sky-500"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked, e.target.checked && !minutes ? '60' : minutes)}
        />
        <span>⏱ {label}</span>
      </label>
      {enabled && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            aria-label="Tiempo límite en minutos"
            value={minutes}
            onChange={(e) => onChange(true, e.target.value)}
            className="w-24 rounded-lg border border-slate-200 bg-transparent p-2 outline-none focus:border-sky-400 dark:border-slate-700"
          />
          <span className="text-slate-500">minutos de tiempo límite</span>
        </div>
      )}
      {invalid && <p className="text-xs text-red-500">Escribe un tiempo entre 1 y 600 minutos.</p>}
    </div>
  );
}
