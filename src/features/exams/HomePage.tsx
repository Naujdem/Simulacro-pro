import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  fetchBestScores,
  fetchExams,
  fetchProfile,
  fetchReviewIds,
  fetchWrongCount,
  fetchWrongQuestions,
  type Exam,
} from './api';
import { QUICK_REVIEW_ID, SUPER_ID, SURPRISE_ID, usePractice } from '@/features/practice/practiceStore';
import { pendingProgress, setLastSlot } from '@/features/practice/progress';
import { useProgressVersion } from '@/features/practice/progressSync';
import ExamStartSheet from './ExamStartSheet';
import ExamStatusBadge from './ExamStatusBadge';
import { useExamStatus } from './useExamStatus';
import Icon, { type IconName } from '@/components/Icon';
import Collapsible from '@/components/Collapsible';

export default function HomePage() {
  const nav = useNavigate();
  const profile = useQuery({ queryKey: ['profile'], queryFn: fetchProfile });
  const exams = useQuery({ queryKey: ['exams'], queryFn: fetchExams });
  const best = useQuery({ queryKey: ['best'], queryFn: fetchBestScores });
  const statusOf = useExamStatus();
  const reviewIds = useQuery({ queryKey: ['review-ids'], queryFn: fetchReviewIds });
  const reviewCount = reviewIds.data?.length ?? 0;
  const wrongCount = useQuery({ queryKey: ['wrong-count'], queryFn: fetchWrongCount });
  const [quickMsg, setQuickMsg] = useState('');
  const [sheet, setSheet] = useState<Exam | null>(null); // simulacro abierto: completo o repaso de las que tengo mal
  useProgressVersion((s) => s.version); // se vuelve a dibujar cuando llega avance de otro dispositivo
  const savedQuick = pendingProgress(QUICK_REVIEW_ID, 'quick_review'); // Repaso Rápido dejado a medias
  const savedSurprise = pendingProgress(SURPRISE_ID, 'surprise'); // Simulacro Sorpresa dejado a medias
  const savedSuper = pendingProgress(SUPER_ID, 'super'); // Super simulacro dejado a medias

  // Repaso Rápido: busca las preguntas pendientes ("Mal" + "Ok"/"Bien" con plazo vencido) y las practica en una sola sesión
  const quick = useMutation({
    mutationFn: fetchWrongQuestions,
    onSuccess: (questions) => {
      if (!questions.length) {
        setQuickMsg('¡Felicidades! No tienes preguntas pendientes por repasar.');
        return;
      }
      setQuickMsg('');
      usePractice.getState().reset();
      usePractice.getState().start(QUICK_REVIEW_ID, questions, 'quick_review');
      nav(`/practice/${QUICK_REVIEW_ID}`);
    },
  });

  const p = profile.data;
  const xpInLevel = p ? p.xp - 100 * (p.level - 1) ** 2 : 0;
  const xpForLevel = p ? 100 * p.level ** 2 - 100 * (p.level - 1) ** 2 : 100;
  const recent = (exams.data ?? []).slice(0, 5);

  return (
    <div className="space-y-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Hola{p?.display_name ? `, ${p.display_name}` : ''} <span aria-hidden="true">👋</span></h1>
        <span
          className="flex items-center gap-1 text-sm font-semibold tabular-nums text-slate-600 dark:text-slate-300"
          title="Racha de días"
          aria-label={`Racha de ${p?.current_streak ?? 0} días`}
        >
          <Icon name="flame" size={18} className="text-amber-500" />
          {p?.current_streak ?? 0}
        </span>
      </header>

      <section aria-label="Nivel y experiencia" className="-mt-3">
        <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-500">
          <span>Nivel {p?.level ?? 1}</span>
          <span className="tabular-nums">{p?.xp ?? 0} XP</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${Math.min(100, (xpInLevel / xpForLevel) * 100)}%` }} />
        </div>
      </section>

      <section>
        <h2 className="section-title mb-2">Practicar</h2>
        <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-700/60">
          {savedQuick && (
            <ActionRow
              icon="play"
              title="Continuar Repaso Rápido"
              hint={`pregunta ${savedQuick.done + 1} de ${savedQuick.total}`}
              highlight
              onClick={() => {
                setLastSlot(QUICK_REVIEW_ID, 'quick_review');
                usePractice.getState().reset();
                nav(`/practice/${QUICK_REVIEW_ID}`);
              }}
            />
          )}
          <ActionRow
            icon="bolt"
            title="Repaso Rápido"
            hint={
              quick.isPending
                ? 'Buscando…'
                : wrongCount.data
                  ? `${wrongCount.data} ${wrongCount.data === 1 ? 'pregunta' : 'preguntas'} por repasar`
                  : 'Practicar'
            }
            disabled={quick.isPending}
            onClick={() => {
              setQuickMsg('');
              quick.mutate();
            }}
          />
          {savedSurprise && (
            <ActionRow
              icon="play"
              title="Continuar Simulacro Sorpresa"
              hint={`pregunta ${savedSurprise.done + 1} de ${savedSurprise.total}`}
              highlight
              onClick={() => {
                setLastSlot(SURPRISE_ID, 'surprise');
                usePractice.getState().reset();
                nav(`/practice/${SURPRISE_ID}`);
              }}
            />
          )}
          <ActionRow icon="dice" title="Simulacro Sorpresa" hint="Preguntas al azar" to="/surprise" />
          {savedSuper && (
            <ActionRow
              icon="play"
              title="Continuar Super simulacro"
              hint={`pregunta ${savedSuper.done + 1} de ${savedSuper.total}`}
              highlight
              onClick={() => {
                setLastSlot(SUPER_ID, 'super');
                usePractice.getState().reset();
                nav(`/practice/${SUPER_ID}`);
              }}
            />
          )}
          <ActionRow icon="clock" title="Super simulacro" hint="Varios con un cronómetro" to="/super" />
          <ActionRow
            icon="bookmark"
            title="Repaso"
            hint={`${reviewCount} ${reviewCount === 1 ? 'pregunta' : 'preguntas'}`}
            to="/review"
          />
        </div>
        {quickMsg && (
          <p className="mt-2 rounded-xl bg-green-50 p-3 text-center text-sm font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
            {quickMsg}
          </p>
        )}
        {quick.isError && <p className="mt-2 text-center text-sm text-red-500">{(quick.error as Error).message}</p>}
      </section>

      <Collapsible title="Simulacros recientes" count={recent.length || undefined} storageKey="home-recientes">
        {!recent.length && (
          <Link to="/new" className="block rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500 dark:border-slate-700">
            Aún no tienes simulacros. ¡Crea o importa el primero!
          </Link>
        )}
        <ul className="space-y-2.5">
          {recent.map((e) => {
            const score = best.data?.[e.id];
            return (
              <li key={e.id} className="card flex items-center gap-1 pr-1.5">
                <button onClick={() => setSheet(e)} className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4 text-left">
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-2 font-semibold">
                      <ExamStatusBadge status={statusOf(e.id)} />
                      <span className="min-w-0 truncate">{e.title}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {e.subject ?? 'Sin tema'} · {e.question_count} preguntas{e.difficulty ? ` · ★ ${e.difficulty}` : ''}
                    </p>
                  </div>
                  {score !== undefined ? (
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-sky-600 dark:text-sky-400">{Math.round(score)}%</span>
                  ) : (
                    <Icon name="chevron" size={18} className="shrink-0 text-slate-300 dark:text-slate-600" />
                  )}
                </button>
                <button
                  aria-label="Editar simulacro"
                  onClick={() => nav(`/exams/${e.id}/edit`)}
                  className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                >
                  <Icon name="pencil" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
        {!!recent.length && (
          <Link to="/library" className="mt-3 block text-center text-sm font-semibold text-sky-600 dark:text-sky-400">
            Ver todos
          </Link>
        )}
      </Collapsible>

      {sheet && <ExamStartSheet exam={sheet} onClose={() => setSheet(null)} />}

    </div>
  );
}

interface ActionRowProps {
  icon: IconName;
  title: string;
  hint: string;
  /** Sesión a medias: única fila con color de acento. */
  highlight?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  to?: string;
}

/** Fila de la lista "Practicar": icono, título y una pista a la derecha. Es botón o enlace según reciba onClick o to. */
function ActionRow({ icon, title, hint, highlight, disabled, onClick, to }: ActionRowProps) {
  const cls = `flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-slate-50 disabled:opacity-60 dark:active:bg-slate-700/50 ${
    highlight ? 'bg-sky-50/80 dark:bg-sky-950/30' : ''
  }`;
  const body = (
    <>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          highlight ? 'bg-sky-500 text-white' : 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400'
        }`}
      >
        <Icon name={icon} size={18} />
      </span>
      <span className={`flex-1 font-medium ${highlight ? 'text-sky-700 dark:text-sky-300' : ''}`}>{title}</span>
      <span className="text-sm text-slate-500">{hint}</span>
      <Icon name="chevron" size={16} className="shrink-0 text-slate-300 dark:text-slate-600" />
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {body}
    </button>
  );
}
