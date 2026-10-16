import { useCallback, useEffect, useState } from 'react';
import { buildDictionary, groupDictionaries, readSources } from './importer';
import { listDictionaries, moveDictionary, removeDictionary, requestPersistence, saveDictionary, type InstalledDict } from './store';

/** Sección de Perfil: instalar, ordenar y quitar diccionarios StarDict (los mismos que usa KOReader). */
export default function DictionaryManager() {
  const [dicts, setDicts] = useState<InstalledDict[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    listDictionaries()
      .then(setDicts)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(refresh, [refresh]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    setMsg('Leyendo archivos…');
    try {
      const groups = groupDictionaries(await readSources(files));
      if (!groups.size) throw new Error('No encontré archivos de StarDict (.ifo, .idx y .dict). Elige también el .zip si los tienes comprimidos.');
      const names: string[] = [];
      const problems: string[] = [];
      for (const [stem, f] of groups) {
        try {
          setMsg(`Instalando «${stem}»… (los diccionarios grandes tardan un poco)`);
          const d = await buildDictionary(stem, f);
          await saveDictionary(d);
          names.push(`${d.name} (${d.wordCount.toLocaleString('es')} palabras)`);
        } catch (err) {
          problems.push((err as Error).message);
        }
      }
      if (names.length) {
        requestPersistence();
        setMsg(`✅ Instalado: ${names.join(', ')}`);
      } else setMsg('');
      if (problems.length) setError(problems.join('\n'));
    } catch (err) {
      setMsg('');
      setError((err as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const act = (fn: () => Promise<void>) => fn().then(refresh).catch((e: Error) => setError(e.message));

  return (
    <section className="space-y-2">
      <h2 className="section-title">Diccionarios (StarDict)</h2>
      <p className="text-sm text-slate-500">
        Instala los mismos diccionarios que usas en KOReader (inglés→español). Al tocar una palabra de una lectura se consultan aquí primero, sin internet
        y sin IA. Elige los archivos <b>.ifo</b>, <b>.idx</b> y <b>.dict.dz</b> juntos, o un <b>.zip</b> / <b>.tar.gz</b> / <b>.tar.xz</b> que los contenga (por ejemplo el <b>.stardict.tar.xz</b> de FreeDict).
      </p>

      {dicts.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {dicts.map((d, i) => (
            <li key={d.id} className="flex items-center gap-2 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.name}</p>
                <p className="text-xs text-slate-500">{d.wordCount.toLocaleString('es')} palabras</p>
              </div>
              <button disabled={i === 0} onClick={() => act(() => moveDictionary(d.id, -1))} aria-label="Consultar antes" className="px-2 text-lg disabled:opacity-30">
                ↑
              </button>
              <button disabled={i === dicts.length - 1} onClick={() => act(() => moveDictionary(d.id, 1))} aria-label="Consultar después" className="px-2 text-lg disabled:opacity-30">
                ↓
              </button>
              <button
                onClick={() => window.confirm(`¿Quitar «${d.name}» de este dispositivo?`) && act(() => removeDictionary(d.id))}
                aria-label={`Quitar ${d.name}`}
                className="px-2 text-red-600"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className={`btn-secondary block w-full cursor-pointer text-center ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        {busy ? 'Instalando…' : '➕ Instalar diccionario'}
        <input type="file" multiple accept=".ifo,.idx,.dict,.dz,.gz,.syn,.zip,.tar,.tgz,.xz,.txz" onChange={onFiles} className="hidden" disabled={busy} />
      </label>
      {msg && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{msg}</p>}
      {error && <p role="alert" className="whitespace-pre-line text-sm font-bold text-red-600">{error}</p>}
    </section>
  );
}
