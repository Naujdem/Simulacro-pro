import { useCallback, useEffect, useState } from 'react';
import { connectDrive, DriveError, preloadGis } from '@/lib/drive';
import { linkFor, getOrCreateLink, publishMedia, setLinkActive, type MediaResult, type SharedLink } from './api';

interface Props {
  examId: string;
  title: string;
  onClose: () => void;
}

/** Ventana "Compartir": crea (o recupera) el enlace del simulacro, deja sus archivos accesibles y muestra las vistas y copias. */
export default function ShareDialog({ examId, title, onClose }: Props) {
  const [link, setLink] = useState<SharedLink | null>(null);
  const [media, setMedia] = useState<MediaResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const publish = useCallback(async () => {
    setBusy(true);
    try {
      setMedia(await publishMedia(examId, true));
    } catch (e) {
      setMedia({ status: 'partial', total: 0, failed: 0 });
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [examId]);

  useEffect(() => {
    void preloadGis().catch(() => undefined); // la ventana de Google debe abrirse directo desde un clic
    let alive = true;
    (async () => {
      try {
        const l = await getOrCreateLink(examId);
        if (!alive) return;
        setLink(l);
        if (l.is_active) await publish();
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [examId, publish]);

  const url = link ? linkFor(link.short_id) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar. Selecciona el enlace y cópialo a mano.');
    }
  };

  const toggle = async () => {
    if (!link) return;
    setBusy(true);
    setError('');
    try {
      const r = await setLinkActive(link, !link.is_active);
      setLink({ ...link, is_active: !link.is_active });
      setMedia(link.is_active ? null : r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setError('');
    try {
      await connectDrive();
      await publish();
    } catch (e) {
      setError(e instanceof DriveError ? e.message : (e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Compartir ${title}`}
        className="max-h-[90dvh] w-full max-w-sm space-y-3 overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-extrabold leading-tight">🔗 Compartir «{title}»</h2>

        {!link && !error && <p className="text-sm text-slate-500">Creando enlace…</p>}

        {link && (
          <>
            <p className="text-xs text-slate-500">
              Cualquiera con este enlace puede ver y hacer el simulacro sin cuenta. Si tiene cuenta, puede guardar una copia.
            </p>
            <input
              readOnly
              aria-label="Enlace para compartir"
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className={`w-full rounded-xl border-2 bg-transparent p-3 text-sm ${link.is_active ? 'border-slate-300 dark:border-slate-600' : 'border-slate-200 text-slate-400 line-through'}`}
            />
            {link.is_active ? (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={copy} className="rounded-xl bg-sky-500 py-3 text-sm font-extrabold text-white">
                  {copied ? '✓ Copiado' : 'Copiar enlace'}
                </button>
                <button
                  onClick={() => (navigator.share ? navigator.share({ title, url }).catch(() => undefined) : copy())}
                  className="rounded-xl border-2 border-slate-300 py-3 text-sm font-bold dark:border-slate-600"
                >
                  Compartir…
                </button>
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                El enlace está desactivado: nadie puede abrirlo.
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 text-center text-sm">
              <div className="rounded-xl bg-slate-100 p-2 dark:bg-slate-700">
                <b className="text-lg">{link.views}</b>
                <br />
                <span className="text-xs text-slate-500">veces abierto</span>
              </div>
              <div className="rounded-xl bg-slate-100 p-2 dark:bg-slate-700">
                <b className="text-lg">{link.copies}</b>
                <br />
                <span className="text-xs text-slate-500">copias guardadas</span>
              </div>
            </div>

            {link.is_active && media?.status === 'ok' && (
              <p className="text-xs text-slate-500">
                ✓ {media.total === 1 ? '1 archivo' : `${media.total} archivos`} (imágenes/audios) accesibles con el enlace.
              </p>
            )}
            {link.is_active && media?.status === 'nodrive' && (
              <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <p>
                  Este simulacro tiene {media.total} {media.total === 1 ? 'archivo' : 'archivos'} en tu Google Drive. Conéctalo para que quien abra el enlace pueda verlos.
                </p>
                <button onClick={connect} className="rounded-lg bg-amber-600 px-3 py-1.5 font-extrabold text-white">
                  Conectar Google Drive
                </button>
              </div>
            )}
            {link.is_active && media?.status === 'partial' && media.failed > 0 && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                No se pudieron compartir {media.failed} de {media.total} archivos; esos no se verán en el enlace.
              </p>
            )}
            {busy && <p className="text-xs text-slate-500">Un momento…</p>}

            <button disabled={busy} onClick={toggle} className="w-full rounded-xl border-2 border-slate-300 py-2.5 text-sm font-bold disabled:opacity-50 dark:border-slate-600">
              {link.is_active ? 'Desactivar enlace' : 'Volver a activar enlace'}
            </button>
          </>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
        <button onClick={onClose} className="w-full py-2 text-sm font-bold text-slate-500">
          Cerrar
        </button>
      </div>
    </div>
  );
}
