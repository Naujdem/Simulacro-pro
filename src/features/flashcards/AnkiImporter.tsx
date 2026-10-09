import React, { useState } from 'react';
import JSZip from 'jszip';
// @ts-ignore
import initSqlJs from 'sql.js';
// @ts-ignore
import he from 'he';
// El .wasm se empaqueta con la app: así coincide con la versión instalada de sql.js y funciona offline (PWA).
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { supabase } from '@/lib/supabase';
import { uploadImage, uploadAudio } from '@/lib/drive';

interface AnkiImporterProps {
  onImportSuccess?: () => void;
}

export const AnkiImporter: React.FC<AnkiImporterProps> = ({ onImportSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatus('Leyendo archivo .apkg...');

    try {
      const zip = await JSZip.loadAsync(file);

      setStatus('Inicializando motor de base de datos...');
      const SQL = await initSqlJs({
        locateFile: () => sqlWasmUrl,
      });

      // Anki moderno (2.1.50+) exporta por defecto en un formato comprimido (collection.anki21b)
      // y deja en collection.anki2 una colección "señuelo". Si solo existe esa, no se puede leer aquí.
      const dbFile = zip.file('collection.anki21') || zip.file('collection.anki2');
      if (!dbFile) {
        throw new Error(
          zip.file('collection.anki21b')
            ? 'Este .apkg usa el formato nuevo de Anki. Expórtalo de nuevo marcando "Soporte para versiones anteriores de Anki" (Compatible with older Anki versions).'
            : 'El archivo .apkg no contiene una colección válida de Anki.',
        );
      }
      if (zip.file('collection.anki21b') && !zip.file('collection.anki21')) {
        throw new Error(
          'Este .apkg usa el formato nuevo de Anki. Expórtalo de nuevo marcando "Soporte para versiones anteriores de Anki" (Compatible with older Anki versions).',
        );
      }

      const dbBuffer = await dbFile.async('uint8array');
      const db = new SQL.Database(dbBuffer);

      setStatus('Analizando archivos multimedia...');
      const mediaFile = zip.file('media');
      let mediaMap: Record<string, string> = {};
      if (mediaFile) {
        const mediaText = await mediaFile.async('text');
        try {
          mediaMap = JSON.parse(mediaText);
        } catch (e) {
          console.warn('No se pudo interpretar el mapa de medios:', e);
        }
      }

      const reverseMediaMap: Record<string, string> = {};
      Object.entries(mediaMap).forEach(([zipName, originalName]) => {
        reverseMediaMap[originalName] = zipName;
      });

      const result = db.exec('SELECT flds FROM notes');
      if (!result.length || !result[0].values) {
        throw new Error('No se encontraron fichas dentro del archivo.');
      }

      const rows = result[0].values;
      let totalImported = 0;
      let totalMediaUploaded = 0;
      // Si Drive falla (p. ej. no está conectado) seguimos importando el texto sin multimedia.
      let driveFailed = '';

      for (let i = 0; i < rows.length; i++) {
        setStatus(`Procesando ficha ${i + 1} de ${rows.length}...`);
        const fldsStr = rows[i][0] as string;
        const fields = fldsStr.split('\x1f');

        let front = fields[0] || '';
        let back = fields[1] || '';

        let imagenRef: string | null = null;
        let audioRef: string | null = null;

        const audioMatch = front.match(/\[sound:(.*?)\]/) || back.match(/\[sound:(.*?)\]/);
        if (audioMatch) {
          const audioFilename = audioMatch[1];
          const zipKey = reverseMediaMap[audioFilename] || audioFilename;
          const audioZipEntry = zip.file(zipKey);

          if (audioZipEntry && !driveFailed) {
            setStatus(`Subiendo audio: ${audioFilename}...`);
            try {
              const audioBlob = await audioZipEntry.async('blob');
              audioRef = await uploadAudio(audioBlob);
              totalMediaUploaded++;
            } catch (e) {
              console.error('No se pudo subir el audio:', e);
              driveFailed = (e as Error).message || 'Error al subir a Google Drive.';
            }
          }
          front = front.replace(/\[sound:.*?\]/g, '');
          back = back.replace(/\[sound:.*?\]/g, '');
        }

        const imgMatch = front.match(/<img[^>]+src=["']([^"']+)["']/i) || back.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) {
          const imgFilename = imgMatch[1];
          const zipKey = reverseMediaMap[imgFilename] || imgFilename;
          const imgZipEntry = zip.file(zipKey);

          if (imgZipEntry && !driveFailed) {
            setStatus(`Subiendo imagen: ${imgFilename}...`);
            try {
              const imgBlob = await imgZipEntry.async('blob');
              imagenRef = await uploadImage(imgBlob);
              totalMediaUploaded++;
            } catch (e) {
              console.error('No se pudo subir la imagen:', e);
              driveFailed = (e as Error).message || 'Error al subir a Google Drive.';
            }
          }
          front = front.replace(/<img[^>]*>/gi, '');
          back = back.replace(/<img[^>]*>/gi, '');
        }

        const cleanedFront = he.decode(front.replace(/<[^>]+>/g, '')).trim();
        const cleanedBack = he.decode(back.replace(/<[^>]+>/g, '')).trim();

        if (cleanedFront || cleanedBack) {
          const { error } = await supabase.from('flashcards').insert({
            front: cleanedFront,
            back: cleanedBack,
            imagen_ref: imagenRef,
            audio_ref: audioRef,
            interval_days: 0,
            repetitions: 0,
            ease_factor: 2.5,
            due_at: new Date().toISOString(),
          });

          if (error) {
            console.error('Error al insertar ficha en Supabase:', error);
          } else {
            totalImported++;
          }
        }
      }

      db.close();
      setStatus(
        `Importación completada: ${totalImported} fichas y ${totalMediaUploaded} archivos multimedia.` +
          (driveFailed ? ` Las imágenes/audios no se subieron: ${driveFailed}` : ''),
      );
      if (onImportSuccess) onImportSuccess();

    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message || 'Ocurrió un problema durante la importación.'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-2xl bg-white shadow-sm dark:bg-slate-800 dark:border-slate-700 space-y-3">
      <h3 className="text-base font-extrabold text-slate-800 dark:text-white">
        Importar mazo .apkg (Anki)
      </h3>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
        Selecciona un mazo comprimido para extraer automáticamente preguntas, respuestas, imágenes y audios.
      </p>

      <label className="inline-flex items-center px-4 py-2.5 bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-sm rounded-2xl cursor-pointer transition-colors disabled:opacity-50">
        {loading ? 'Procesando…' : 'Seleccionar .apkg'}
        <input
          type="file"
          accept=".apkg"
          onChange={handleFileUpload}
          disabled={loading}
          className="hidden"
        />
      </label>

      {status && (
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          {status}
        </p>
      )}
    </div>
  );
};
