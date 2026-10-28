import { audioUrlFor, imageUrlFor } from './drive';

// Un solo audio suena a la vez: al empezar otro, el anterior se detiene (y su botón vuelve a "escuchar").
let current: { el: HTMLAudioElement; end?: () => void } | null = null;

// Cada reproducción (o serie de audios) lleva un número: si empieza otra, la anterior ya no sigue.
let token = 0;

/** Detiene lo que esté sonando, incluida una serie de audios a medias. */
export function stopAudio() {
  token++;
  stopCurrent();
}

function stopCurrent() {
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

/** Devuelve false si no llegó a sonar porque otro audio lo reemplazó mientras cargaba. */
async function start(ref: string, myToken: number, onEnd?: () => void): Promise<boolean> {
  const url = await playableUrl(ref);
  if (myToken !== token) {
    onEnd?.(); // mientras cargaba, empezó otro audio o se detuvo todo
    return false;
  }
  stopCurrent();
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
  return true;
}

/**
 * Reproduce un audio (referencia gd:<id> o URL). Resuelve cuando empieza a sonar (true) o si otro audio
 * lo reemplazó mientras cargaba (false); `onEnd` se llama al terminar o detenerse.
 */
export function playAudio(ref: string, onEnd?: () => void): Promise<boolean> {
  return start(ref, ++token, onEnd);
}

/** Reproduce varios audios uno tras otro. Se corta si se toca otro audio o se llama a stopAudio(). */
export async function playAudioSequence(refs: string[]): Promise<void> {
  const myToken = ++token;
  for (const ref of refs) {
    if (myToken !== token) return;
    await new Promise<void>((resolve, reject) => {
      start(ref, myToken, () => resolve()).catch(reject);
    });
  }
}

/** Descarga por adelantado imágenes y audios de las próximas fichas para que no haya espera al mostrarlas. */
export function prefetchRefs(refs: (string | null | undefined)[]) {
  for (const ref of refs) {
    if (ref) imageUrlFor(ref).catch(() => {}); // misma descarga con caché que usa el audio
  }
}
