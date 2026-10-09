import { useEffect, useState } from 'react';
import { imageUrlFor } from '@/lib/drive';

// Muestra la imagen de una pregunta (referencia "gd:<id>"). Si no carga: "Imagen no disponible".
export default function QuestionImage({ src, className = '' }: { src?: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    setState('loading');
    setUrl(null);
    imageUrlFor(src)
      .then((u) => {
        if (!alive) return;
        setUrl(u);
        setState('ok');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [src]);

  if (!src) return null;

  if (state === 'error')
    return (
      <p className={`rounded-xl bg-slate-100 p-3 text-center text-sm text-slate-500 dark:bg-slate-700 ${className}`}>
        Imagen no disponible
      </p>
    );

  if (state === 'loading' || !url)
    return <div className={`h-40 w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700 ${className}`} />;

  return (
    <>
      <img
        src={url}
        alt="Imagen de la pregunta"
        onClick={() => setZoom(true)}
        onError={() => setState('error')}
        className={`max-h-72 w-full cursor-zoom-in rounded-xl bg-white object-contain ${className}`}
      />
      {zoom && (
        <div
          role="dialog"
          aria-label="Imagen ampliada"
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3"
        >
          <img src={url} alt="Imagen ampliada" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </>
  );
}
