import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFolders } from '@/features/exams/api';
import { describeSummary, parseImportJson, type ParseResult } from '@/lib/jsonImport';
import { findFolder, runImport, type ImportResult } from './jsonImportApi';
import { JSON_EXAMPLE, JSON_PROMPT } from './jsonPrompt';

const TYPE_NAMES: Record<string, string> = {
  multiple_choice: 'opción múltiple',
  true_false: 'verdadero/falso',
  fill_blank: 'completar',
  order_words: 'ordenar palabras',
  transform: 'transformar',
};

const btn = 'rounded-xl px-4 py-3 text-sm font-extrabold disabled:opacity-50';

export default function JsonImportPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const folders = useQuery({ queryKey: ['folders'], queryFn: fetchFolders });
  const [text, setText] = useState('');
  const [checked, setChecked] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<ImportResult | null>(null);
  const [copied, setCopied] = useState(false);

  const edit = (v: string) => {
    setText(v);
    setChecked(null); // al cambiar el texto hay que volver a revisar
    setError('');
  };

  const review = () => {
    setError('');
    setChecked(parseImportJson(text));
  };

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(JSON_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('No se pudo copiar automáticamente. Mantén presionado el texto de la guía y cópialo a mano.');
    }
  }

  async function save() {
    if (!checked?.ok) return;
    setSaving(true);
    setError('');
    try {
      const existing = (await qc.fetchQuery({ queryKey: ['folders'], queryFn: fetchFolders, staleTime: 0 })) ?? [];
      const res = await runImport(checked.plan, existing, setProgress);
      await qc.invalidateQueries(); // bibliotecas, simulacros y fichas se vuelven a leer
      setDone(res);
      setText('');
      setChecked(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
      setProgress('');
    }
  }

  const reused = useMemo(
    () => (checked?.ok ? checked.plan.folders.filter((f) => findFolder(folders.data ?? [], f.name)).map((f) => f.name) : []),
    [checked, folders.data],
  );

  if (done) {
    const parts = [
      done.folders && `${done.folders} ${done.folders === 1 ? 'biblioteca' : 'bibliotecas'}`,
      done.reusedFolders && `${done.reusedFolders} ${done.reusedFolders === 1 ? 'biblioteca ya existente' : 'bibliotecas ya existentes'} (se agregó a ellas)`,
      done.exams && `${done.exams} ${done.exams === 1 ? 'simulacro' : 'simulacros'}`,
      done.questions && `${done.questions} ${done.questions === 1 ? 'pregunta' : 'preguntas'}`,
      done.readings && `${done.readings} ${done.readings === 1 ? 'lectura' : 'lecturas'}`,
      done.cards && `${done.cards} ${done.cards === 1 ? 'ficha' : 'fichas'}`,
    ].filter(Boolean);
    return (
      <div className="space-y-4 p-4">
        <div role="status" className="space-y-2 rounded-2xl bg-green-100 p-5 dark:bg-green-950">
          <p className="text-xl font-extrabold text-green-800 dark:text-green-200">✅ ¡Importación completada!</p>
          <ul className="list-inside list-disc text-sm text-green-900 dark:text-green-100">
            {parts.map((p) => (
              <li key={String(p)}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="grid gap-2">
          {done.exams > 0 && (
            <button onClick={() => nav('/library')} className={`${btn} bg-sky-500 text-white`}>
              Ir a la biblioteca
            </button>
          )}
          {done.cards > 0 && (
            <button onClick={() => nav('/flashcards')} className={`${btn} bg-violet-500 text-white`}>
              Ir a las fichas
            </button>
          )}
          <button onClick={() => setDone(null)} className={`${btn} border-2 border-slate-300 dark:border-slate-600`}>
            Importar otro JSON
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <Link to="/new" className="text-sm font-bold text-slate-500">
          ← Crear / Importar
        </Link>
        <h1 className="text-2xl font-extrabold">Importar JSON</h1>
        <p className="text-sm text-slate-500">
          Genera el JSON con ChatGPT o Claude, pégalo aquí y se crean bibliotecas, simulacros, preguntas, lecturas y fichas de una vez.
        </p>
      </header>

      <details className="rounded-2xl border-2 border-slate-200 p-3 text-sm dark:border-slate-700">
        <summary className="cursor-pointer font-bold">¿Cómo le pido el JSON a la IA?</summary>
        <div className="mt-2 space-y-2">
          <p>Copia esta guía, pégala en ChatGPT o Claude y pega debajo tu material (temario, preguntas, vocabulario…).</p>
          <button onClick={copyPrompt} className={`${btn} w-full bg-violet-500 text-white`}>
            {copied ? '✓ Copiada' : '📋 Copiar guía para la IA'}
          </button>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-100 p-3 text-xs dark:bg-slate-800">{JSON_PROMPT}</pre>
        </div>
      </details>

      <textarea
        aria-label="JSON a importar"
        value={text}
        onChange={(e) => edit(e.target.value)}
        disabled={saving}
        rows={14}
        spellCheck={false}
        placeholder={'Pega aquí el JSON…\n{\n  "version": 1,\n  "bibliotecas": [ … ]\n}'}
        className="w-full rounded-xl border-2 border-slate-200 bg-transparent p-3 font-mono text-xs outline-none focus:border-sky-400 dark:border-slate-700"
      />

      <div className="flex gap-2">
        <button onClick={review} disabled={saving || !text.trim()} className={`${btn} flex-1 bg-sky-500 text-white`}>
          Revisar JSON
        </button>
        <button onClick={() => edit(JSON_EXAMPLE)} disabled={saving} className={`${btn} border-2 border-slate-300 dark:border-slate-600`}>
          Ver ejemplo
        </button>
      </div>

      {checked && !checked.ok && (
        <div role="alert" className="space-y-2 rounded-2xl bg-red-50 p-4 dark:bg-red-950">
          <p className="font-extrabold text-red-700 dark:text-red-300">
            Hay {checked.errors.length === 1 ? '1 problema' : `${checked.errors.length} problemas`} que corregir:
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm text-red-700 dark:text-red-300">
            {checked.errors.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          <p className="text-xs text-red-600/80">Corrige el texto (o pídele a la IA que lo corrija con estos mensajes) y vuelve a pulsar “Revisar JSON”.</p>
        </div>
      )}

      {checked?.ok && (
        <section aria-label="Vista previa" className="space-y-3 rounded-2xl border-2 border-green-400 p-4">
          <div>
            <p className="text-xs font-bold uppercase text-green-700 dark:text-green-300">Vista previa</p>
            <p className="text-lg font-extrabold">{describeSummary(checked.summary)}</p>
            {checked.summary.questions > 0 && (
              <p className="text-xs text-slate-500">
                {Object.entries(checked.summary.byType)
                  .filter(([, n]) => n > 0)
                  .map(([t, n]) => `${n} ${TYPE_NAMES[t]}`)
                  .join(' · ')}
              </p>
            )}
          </div>

          <ul className="space-y-2 text-sm">
            {checked.plan.folders.map((f) => (
              <li key={f.name}>
                <p className="font-bold">
                  📚 {f.name}{' '}
                  {reused.includes(f.name) && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">ya existe: se agregará a ella</span>
                  )}
                </p>
                <ul className="ml-5 list-disc text-slate-600 dark:text-slate-300">
                  {f.exams.map((e) => (
                    <li key={e.title}>
                      {e.title} · {e.questions.length} {e.questions.length === 1 ? 'pregunta' : 'preguntas'}
                      {e.readings.length > 0 && ` · ${e.readings.length} ${e.readings.length === 1 ? 'lectura' : 'lecturas'}`}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {checked.plan.looseExams.length > 0 && (
              <li>
                <p className="font-bold">📝 Sin biblioteca</p>
                <ul className="ml-5 list-disc text-slate-600 dark:text-slate-300">
                  {checked.plan.looseExams.map((e) => (
                    <li key={e.title}>
                      {e.title} · {e.questions.length} {e.questions.length === 1 ? 'pregunta' : 'preguntas'}
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {checked.plan.cards.length > 0 && (
              <li>
                <p className="font-bold">🃏 {checked.plan.cards.length} {checked.plan.cards.length === 1 ? 'ficha' : 'fichas'}</p>
                <p className="ml-5 text-slate-600 dark:text-slate-300">
                  {[...new Set(checked.plan.cards.map((c) => c.deck ?? 'Sin mazo'))].join(' · ')}
                </p>
              </li>
            )}
          </ul>

          {checked.warnings.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <p className="font-bold">Avisos (no impiden importar):</p>
              <ul className="list-inside list-disc">
                {checked.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={save} disabled={saving} className={`${btn} w-full bg-green-600 text-white`}>
            {saving ? 'Importando…' : 'Confirmar e importar todo'}
          </button>
          {saving && progress && <p className="text-center text-xs font-bold text-slate-500">{progress}</p>}
        </section>
      )}

      {error && (
        <p role="alert" className="whitespace-pre-line rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
