import JSZip from 'jszip';
import { StarDict, gunzip, parseIfo } from './stardict';

/*
 * Convierte lo que el usuario elige (archivos sueltos .ifo/.idx/.dict.dz, un .zip o un .tar/.tar.gz/.tar.xz) en diccionarios
 * StarDict listos para guardar.
 */

export interface DictFiles {
  ifo?: Uint8Array;
  idx?: Uint8Array;
  dict?: Uint8Array;
  syn?: Uint8Array;
}

const base = (path: string) => path.split(/[\\/]/).pop() ?? path;
const decoder = new TextDecoder();

/** Lee un .tar (ya sin comprimir). Solo archivos normales; los nombres se reducen al nombre del archivo. */
export function untar(data: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  let p = 0;
  while (p + 512 <= data.length) {
    const header = data.subarray(p, p + 512);
    if (header.every((b) => b === 0)) break; // fin del archivo
    const cstr = (from: number, len: number) => decoder.decode(header.subarray(from, from + len)).split('\0')[0];
    const name = cstr(0, 100);
    const size = parseInt(cstr(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    p += 512;
    if (Number.isNaN(size)) throw new Error('El archivo .tar está dañado.');
    if ((type === '0' || type === '\0') && name && !name.endsWith('/')) out.set(base(name), data.slice(p, p + size));
    p += Math.ceil(size / 512) * 512;
  }
  return out;
}

const UNSUPPORTED = /\.(7z|rar|bz2|tar\.bz2|tbz2?)$/i;

/** Descomprime .xz (el formato de los .stardict.tar.xz de FreeDict). La librería se carga solo cuando hace falta. */
export async function unxz(data: Uint8Array): Promise<Uint8Array> {
  const { XzReadableStream } = await import('xz-decompress');
  const stream = new XzReadableStream(new Blob([data as BlobPart]).stream());
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Junta todos los archivos que hay dentro de lo elegido, por nombre. */
export async function readSources(files: File[]): Promise<Map<string, Uint8Array>> {
  const named = new Map<string, Uint8Array>();
  for (const f of files) {
    const name = f.name;
    if (UNSUPPORTED.test(name)) {
      throw new Error(
        `"${name}" está comprimido en un formato que la app no puede abrir. Extrae el archivo con tu administrador de archivos (por ejemplo ZArchiver) y elige los archivos .ifo, .idx y .dict.dz, o comprímelos en un .zip.`,
      );
    }
    if (/\.zip$/i.test(name)) {
      const zip = await JSZip.loadAsync(f);
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir) named.set(base(entry.name), await entry.async('uint8array'));
      }
    } else if (/\.(tar|tar\.gz|tgz)$/i.test(name)) {
      const raw = await gunzip(new Uint8Array(await f.arrayBuffer()));
      for (const [n, d] of untar(raw)) named.set(n, d);
    } else if (/\.(tar\.xz|txz)$/i.test(name)) {
      let raw: Uint8Array;
      try {
        raw = await unxz(new Uint8Array(await f.arrayBuffer()));
      } catch {
        throw new Error(`No pude descomprimir "${name}": el archivo está dañado o incompleto. Vuelve a descargarlo.`);
      }
      for (const [n, d] of untar(raw)) named.set(n, d);
    } else {
      named.set(name, new Uint8Array(await f.arrayBuffer()));
    }
  }
  return named;
}

const PARTS: [RegExp, keyof DictFiles][] = [
  [/\.ifo$/i, 'ifo'],
  [/\.idx(\.gz)?$/i, 'idx'],
  [/\.dict(\.dz)?$/i, 'dict'],
  [/\.syn(\.dz|\.gz)?$/i, 'syn'],
];

/** Agrupa los archivos por nombre de diccionario (todo lo que va antes de .ifo/.idx/.dict/.syn). */
export function groupDictionaries(named: Map<string, Uint8Array>): Map<string, DictFiles> {
  const groups = new Map<string, DictFiles>();
  for (const [name, data] of named) {
    for (const [re, key] of PARTS) {
      if (re.test(name)) {
        const stem = name.replace(re, '');
        const g = groups.get(stem) ?? {};
        g[key] = data;
        groups.set(stem, g);
        break;
      }
    }
  }
  return groups;
}

export interface ImportedDict {
  name: string;
  wordCount: number;
  ifo: string;
  idx: Uint8Array;
  dict: Uint8Array;
  syn?: Uint8Array;
}

/** Descomprime, comprueba que se pueda leer y devuelve el diccionario. Lanza un error en español si falta algo. */
export async function buildDictionary(stem: string, f: DictFiles): Promise<ImportedDict> {
  const missing = (['ifo', 'idx', 'dict'] as const).filter((k) => !f[k]).map((k) => `.${k}`);
  if (missing.length) throw new Error(`A «${stem}» le faltan archivos: ${missing.join(', ')}. Elige los tres juntos (.ifo, .idx y .dict o .dict.dz).`);
  const ifo = decoder.decode(f.ifo!);
  parseIfo(ifo); // valida que sea StarDict
  const idx = await gunzip(f.idx!);
  const dict = await gunzip(f.dict!);
  const syn = f.syn ? await gunzip(f.syn) : undefined;
  const sd = new StarDict({ ifo, idx, dict, syn }); // si el formato no coincide, aquí falla
  if (sd.size === 0) throw new Error(`«${stem}» no tiene palabras.`);
  return { name: sd.info.name || stem, wordCount: sd.size, ifo, idx, dict, syn };
}
