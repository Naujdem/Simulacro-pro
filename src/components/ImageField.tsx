import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { DriveError, connectDrive, preloadGis, uploadImage } from '@/lib/drive';
import QuestionImage from './QuestionImage';

// Lógica compartida: subir foto, pegar (Ctrl+V o botón) y conectar Drive la primera vez.
export function useImageUpload(value: string | null, onChange: (v: string | null) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Blob | null>(null); // imagen en espera de que conectes Drive

  useEffect(() => {
    preloadGis().catch(() => undefined); // así la ventana de Google no se bloquea al conectar
  }, []);

  async function send(file: Blob) {
    setBusy(true);
    setError('');
    try {
      onChange(await uploadImage(file));
      setPending(null);
    } catch (e) {
      if (e instanceof DriveError && (e.code === 'noconnect' || e.code === 'reconnect')) {
        setPending(file);
        setError('Primero conecta tu Google Drive (solo se hace una vez).');
      } else {
        setError((e as Error).message || 'No se pudo subir la imagen.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function connectAndRetry() {
    setError('');
    try {
      await connectDrive();
    } catch (e) {
      setError((e as Error).message || 'No se pudo conectar.');
      return;
    }
    if (pending) await send(pending);
    else setError('');
  }

  async function pasteFromButton() {
    setError('');
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) return send(await it.getType(type));
      }
      setError('No hay ninguna imagen copiada.');
    } catch {
      setError('Tu navegador no permite pegar con el botón. Mantén pulsado en el cuadro de texto y pega, o usa "Subir foto".');
    }
  }

  // Para poner en el contenedor de la pregunta: captura Ctrl+V solo si lo copiado es una imagen.
  function onPaste(e: ClipboardEvent) {
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (!file) return; // texto normal: se pega como siempre
    e.preventDefault();
    void send(file);
  }

  return { value, busy, error, pending, send, connectAndRetry, pasteFromButton, onPaste, remove: () => onChange(null) };
}

export type ImageUpload = ReturnType<typeof useImageUpload>;

export function ImageField({ up }: { up: ImageUpload }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const btn = 'rounded-lg border-2 px-3 py-1.5 text-xs font-extrabold disabled:opacity-50 dark:border-slate-600';

  return (
    <div className="space-y-2">
      {up.value && <QuestionImage src={up.value} />}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void up.send(f);
          }}
        />
        <button type="button" disabled={up.busy} onClick={() => fileRef.current?.click()} className={btn}>
          📷 {up.value ? 'Cambiar foto' : 'Subir foto'}
        </button>
        <button type="button" disabled={up.busy} onClick={up.pasteFromButton} className={btn}>
          📋 Pegar imagen
        </button>
        {up.value && (
          <button type="button" disabled={up.busy} onClick={up.remove} className={btn + ' text-red-500'}>
            Quitar imagen
          </button>
        )}
      </div>

      {up.busy && <p className="text-xs font-bold text-slate-500">Subiendo a tu Google Drive…</p>}
      {up.error && <p className="text-xs text-red-500">{up.error}</p>}
      {up.pending && !up.busy && (
        <button type="button" onClick={up.connectAndRetry} className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-extrabold text-white">
          Conectar Google Drive
        </button>
      )}
      {!up.value && !up.busy && (
        <p className="text-xs text-slate-400">También puedes copiar una imagen y pegarla aquí con Ctrl+V.</p>
      )}
    </div>
  );
}
