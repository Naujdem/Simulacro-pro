import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { correctText, type Question } from '@/lib/grading';
import { explainQuestion, fetchAiCacheInfo, saveSimilarAsExam, similarQuestions, type GeneratedQuestion } from './api';

// En las preguntas de "completar espacios" muestra ____ en lugar de {{1}}
const showPrompt = (p: string) => p.replace(/\{\{\d+\}\}/g, '____');

interface Props {
  q: Question;
  examId: string;
}

// Botones de IA para una pregunta fallada: "Explicar" y "Preguntas similares".
export default function AiPanel({ q, examId }: Props) {
  const qc = useQueryClient();
  const nav = useNavigate();

  // Lectura gratuita del cache: sirve para saber si ya hay algo guardado (sin gastar solicitudes)
  const info = useQuery({ queryKey: ['ia-cache', q.id], queryFn: () => fetchAiCacheInfo(q.id) });
  const refreshInfo = () => qc.invalidateQueries({ queryKey: ['ia-cache', q.id] });

  const explain = useMutation({ mutationFn: () => explainQuestion(q.id), onSuccess: refreshInfo });
  const similar = useMutation({ mutationFn: () => similarQuestions(q.id), onSuccess: refreshInfo });
  const save = useMutation({
    mutationFn: (generadas: GeneratedQuestion[]) => saveSimilarAsExam(q.id, examId, q.prompt, generadas),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams'] });
      refreshInfo();
    },
  });

  const explanationText = explain.data?.contenido.texto;
  const generated = similar.data?.contenido.preguntas;
  const savedExamId = save.data ?? similar.data?.simulacro_id ?? info.data?.simulacroId ?? null;

  const btn = 'rounded-lg border-2 border-violet-500 px-3 py-1.5 text-xs font-extrabold text-violet-700 disabled:opacity-50 dark:text-violet-300';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button disabled={explain.isPending} onClick={() => explain.mutate()} className={btn}>
          {explain.isPending ? 'Explicando…' : info.data?.explicacion ? '💡 Ver explicación' : '💡 Explicar'}
        </button>
        <button disabled={similar.isPending} onClick={() => similar.mutate()} className={btn}>
          {similar.isPending
            ? 'Generando…'
            : info.data?.similares
              ? '✨ Ver preguntas similares'
              : '✨ Preguntas similares'}
        </button>
      </div>

      {explain.isError && <p className="text-xs text-red-600">{(explain.error as Error).message}</p>}
      {similar.isError && <p className="text-xs text-red-600">{(similar.error as Error).message}</p>}

      {explanationText && (
        <div className="space-y-1 rounded-lg bg-white/70 p-3 text-xs dark:bg-slate-900/60">
          <p className="whitespace-pre-line">{explanationText}</p>
          <p className="text-[10px] text-slate-500">
            {explain.data?.origen === 'cache' ? 'Guardada · no gastó solicitudes' : 'Generada con IA'}
          </p>
        </div>
      )}

      {generated && (
        <div className="space-y-2 rounded-lg bg-white/70 p-3 text-xs dark:bg-slate-900/60">
          <p className="font-extrabold">
            {generated.length} preguntas similares{' '}
            <span className="text-[10px] font-normal text-slate-500">
              ({similar.data?.origen === 'cache' ? 'guardadas · no gastó solicitudes' : 'generadas con IA'})
            </span>
          </p>

          <ol className="list-decimal space-y-2 pl-4">
            {generated.map((g, i) => (
              <li key={i} className="space-y-1">
                <p>{showPrompt(g.prompt)}</p>
                {g.type === 'multiple_choice' && (
                  <ul className="pl-1">
                    {(g.options ?? []).map((o) => (
                      <li key={o.id} className={g.answer.correct?.includes(o.id) ? 'font-bold text-green-700 dark:text-green-400' : ''}>
                        {o.id.toUpperCase()}) {o.text}
                      </li>
                    ))}
                  </ul>
                )}
                {g.type !== 'multiple_choice' && (
                  <p className="font-bold text-green-700 dark:text-green-400">
                    Respuesta: {correctText({ id: 'tmp', ...g })}
                  </p>
                )}
                {g.explanation && <p className="text-slate-500">{g.explanation}</p>}
              </li>
            ))}
          </ol>

          {savedExamId ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-green-700 dark:text-green-400">✓ Guardadas como simulacro</span>
              <button onClick={() => nav(`/practice/${savedExamId}`)} className="rounded-lg bg-violet-600 px-3 py-1.5 font-extrabold text-white">
                Practicar ahora
              </button>
            </div>
          ) : (
            <button
              disabled={save.isPending}
              onClick={() => save.mutate(generated)}
              className="rounded-lg bg-green-600 px-3 py-1.5 font-extrabold text-white disabled:opacity-50"
            >
              {save.isPending ? 'Guardando…' : '💾 Guardar como simulacro'}
            </button>
          )}
          {save.isError && <p className="text-red-600">{(save.error as Error).message}</p>}
        </div>
      )}

      {/* Si ya guardaste el simulacro en otra sesión y aún no abriste las preguntas */}
      {!generated && info.data?.simulacroId && (
        <button onClick={() => nav(`/practice/${info.data!.simulacroId}`)} className={btn}>
          ▶ Practicar el simulacro de similares
        </button>
      )}
    </div>
  );
}
