import { useState } from 'react';
import type { AttemptPoint, BarItem } from './statsLogic';

const INK = 'text-slate-700 dark:text-slate-200';
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Barras horizontales: una barra por biblioteca, con el % al final y cuántas respuestas lo respaldan. */
export function BarChart({ items }: { items: BarItem[] }) {
  return (
    <ul className="space-y-3">
      {items.map((b) => (
        <li key={b.name} title={`${b.name}: ${b.correct} de ${b.answered} correctas`}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className={`min-w-0 truncate font-bold ${INK}`}>{b.name}</span>
            <span className={`shrink-0 font-bold ${INK}`}>
              {b.pct}% <span className="text-xs font-normal text-slate-500">· {b.answered} resp.</span>
            </span>
          </div>
          <div
            className="mt-1 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            role="img"
            aria-label={`${b.name}: ${b.pct}% de aciertos (${b.correct} de ${b.answered})`}
          >
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(b.pct, b.pct ? 2 : 0)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const W = 320;
const H = 170;
const PAD = { l: 30, r: 10, t: 10, b: 8 };

/** Línea con el % de cada simulacro (0–100). Toca un punto para ver cuál fue. */
export function LineChart({ points }: { points: AttemptPoint[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const cur = sel != null ? points[sel] : points[points.length - 1];
  const idx = sel != null ? sel : points.length - 1;
  const x = (i: number) => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (points.length - 1));
  const y = (v: number) => PAD.t + ((100 - v) * (H - PAD.t - PAD.b)) / 100;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Evolución de tus últimos ${points.length} simulacros`}>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(g) + 4} textAnchor="end" className="fill-slate-500" fontSize="10">
              {g}%
            </text>
          </g>
        ))}
        {points.length > 1 && <path d={path} fill="none" className="stroke-sky-500" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => (
          <g key={p.id} onClick={() => setSel(i)} className="cursor-pointer">
            {/* zona táctil más grande que el punto */}
            <circle cx={x(i)} cy={y(p.score)} r="14" fill="transparent" />
            <circle
              cx={x(i)}
              cy={y(p.score)}
              r={i === idx ? 5 : 4}
              className={i === idx ? 'fill-sky-500 stroke-white dark:stroke-slate-900' : 'fill-sky-500 stroke-white dark:stroke-slate-900'}
              strokeWidth="2"
            />
          </g>
        ))}
      </svg>
      <p className={`text-center text-sm ${INK}`} aria-live="polite">
        <b>{cur.score}%</b> · {cur.title} · {fmtDate(cur.finished_at)}
      </p>
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer font-bold">Ver como tabla</summary>
        <table className="mt-2 w-full text-left">
          <tbody>
            {points.map((p) => (
              <tr key={p.id}>
                <td className="py-0.5 pr-2">{fmtDate(p.finished_at)}</td>
                <td className="truncate pr-2">{p.title}</td>
                <td className="text-right font-bold">{p.score}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
