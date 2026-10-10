import { audioUrlFor, imageUrlFor } from './drive';

// Un solo audio suena a la vez: al empezar otro, el anterior se detiene (y su botón vuelve a "escuchar").
let current: { el: HTMLAudioElement; end?: () => void } | null = null;

export function stopAudio() {
  if (!current) return;
  const c = current;
  current = null;
  c.el.pause();
  c.end?.();
}

// Drive a veces devuelve el archivo sin tipo (application/octet-stream) y algunos navegadores no lo reproducen:
// en ese caso se le pone el tipo de audio.
const playable = new Map<string, Promise<string>>();
function playableUrl(ref: string): Promise<string> {
  let p = playable.get(ref);
  if (!p) {
    p = (async () => {
      const url = await audioUrlFor(ref);
      if (!url.startsWith('blob:')) return url;
      const blob = await (await fetch(url)).blob();
      return blob.type.startsWith('audio/') ? url : URL.createObjectURL(new Blob([blob], { type: 'audio/mpeg' }));
    })();
    playable.set(ref, p);
    p.catch(() => playable.delete(ref));
  }
  return p;
}

/** Reproduce un audio (referencia gd:<id> o URL). Resuelve cuando empieza a sonar; `onEnd` se llama al terminar o detenerse. */
export async function playAudio(ref: string, onEnd?: () => void): Promise<void> {
  const url = await playableUrl(ref);
  stopAudio();
  const el = new Audio(url);
  const entry = { el, end: onEnd };
  current = entry;
  const finish = () => {
    if (current === entry) current = null;
    onEnd?.();
  };
  el.addEventListener('ended', finish);
  el.addEventListener('error', finish);
  try {
    await el.play();
  } catch (e) {
    if (current === entry) current = null;
    throw e;
  }
}

/** Descarga por adelantado imágenes y audios de las próximas fichas para que no haya espera al mostrarlas. */
export function prefetchRefs(refs: (string | null | undefined)[]) {
  for (const ref of refs) {
    if (ref) imageUrlFor(ref).catch(() => {}); // misma descarga con caché que usa el audio
  }
}
