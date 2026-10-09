import React, { useEffect, useState } from 'react';
import { audioUrlFor } from '@/lib/drive';

interface AudioPlayerProps {
  src: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src }) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setError(false);

    audioUrlFor(src)
      .then((url) => {
        if (isMounted) setAudioUrl(url);
      })
      .catch((err) => {
        console.error('Error cargando el audio desde Drive:', err);
        if (isMounted) setError(true);
      });

    return () => {
      isMounted = false;
    };
  }, [src]);

  if (error) {
    return (
      <div className="text-xs text-red-500 italic">
        No se pudo cargar el audio.
      </div>
    );
  }

  if (!audioUrl) {
    return (
      <div className="text-xs text-gray-400 animate-pulse">
        Cargando audio...
      </div>
    );
  }

  return (
    <div className="my-2">
      <audio controls src={audioUrl} className="w-full max-w-md h-10">
        Tu navegador no soporta la reproducción de audio.
      </audio>
    </div>
  );
};
