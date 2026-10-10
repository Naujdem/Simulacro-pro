import { useEffect, useRef, useState } from 'react';
import { playAudio, stopAudio } from '@/lib/playAudio';

type State = 'idle' | 'loading' | 'playing' | 'error';

interface Props {
  src: string;
  /** "md": botón grande para la pantalla de estudio; "sm": compacto para listas. */
  size?: 'md' | 'sm';
  className?: string;
}

const ICON: Record<State, string> = { idle: '🔊', loading: '⏳', playing: '⏹️', error: '⚠️' };
const TITLE: Record<State, string> = {
  idle: 'Escuchar',
  loading: 'Cargando audio…',
  playing: 'Detener',
  error: 'No se pudo reproducir. Toca para reintentar',
};

export function AudioButton({ src, size = 'md', className = '' }: Props) {
  const [state, setState] = useState<State>('idle');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Si cambia la ficha, vuelve a "escuchar"
  useEffect(() => setState('idle'), [src]);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (state === 'playing') {
      stopAudio();
      return;
    }
    setState('loading');
    try {
      await playAudio(src, () => alive.current && setState('idle'));
      if (alive.current) setState('playing');
    } catch (err) {
      console.error('No se pudo reproducir el audio:', err);
      if (alive.current) setState('error');
    }
  }

  const dims = size === 'md' ? 'h-12 w-12 text-2xl' : 'h-9 w-9 text-lg';
  return (
    <button
      type="button"
      onClick={toggle}
      title={TITLE[state]}
      aria-label={TITLE[state]}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 ${
        state === 'error' ? 'border-red-400' : 'border-sky-400'
      } ${dims} ${className}`}
    >
      {ICON[state]}
    </button>
  );
}
