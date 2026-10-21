import Icon, { type IconName } from '@/components/Icon';
import type { ExamStatus } from './examStatus';

const CONFIG: Record<Exclude<ExamStatus, 'none'>, { icon: IconName; label: string; cls: string }> = {
  pending: {
    icon: 'clock',
    label: 'Pendiente: lo dejaste a medias',
    cls: 'bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400',
  },
  perfect: {
    icon: 'check',
    label: 'Completado sin errores',
    cls: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400',
  },
  errors: {
    icon: 'alert',
    label: 'Completado con errores',
    cls: 'bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-400',
  },
};

/** Indicador de estado de un simulacro en las listas. No muestra nada si nunca se ha hecho. */
export default function ExamStatusBadge({ status }: { status: ExamStatus }) {
  if (status === 'none') return null;
  const { icon, label, cls } = CONFIG[status];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${cls}`}
    >
      <Icon name={icon} size={14} strokeWidth={2.5} />
    </span>
  );
}
