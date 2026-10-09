import React, { useState } from 'react';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import he from 'he';
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
      // 1. Descomprimir el archivo .apkg (ZIP)
      const zip = await JSZip.loadAsync(file);

      // 2. Cargar motor de SQLite
      setStatus('Inicializando motor de base de datos...');
      const SQL = await initSqlJs({
        locateFile: (filename) => `https://sql.js.org/dist/${filename}`,
      });

      const dbFile = zip.file('collection.anki2') || zip.file('collection.anki21');
      if (!dbFile) {
        throw new Error('El archivo .apkg no contiene una colección válida de Anki.');
      }

      const dbBuffer = await dbFile.async('uint8array');
      const db = new SQL.Database(dbBuffer);

      // 3. Obtener el mapa de archivos multimedia
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

      // Invertir mapa para buscar por nombre original de archivo
      const reverseMediaMap: Record<string, string> = {};
      Object.entries(mediaMap).forEach(([zipName, originalName]) => {
        reverseMediaMap[originalName] = zipName;
      });

      // 4. Leer las tarjetas desde la tabla de notas
      const result = db.exec('SELECT flds FROM notes');
      if (!result.length || !result[0].values) {
        throw new Error('No se encontraron fichas dentro del archivo.');
      }

      const rows = result[0].values;
      let totalImported = 0;
      let totalMediaUploaded = 0;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // 5. Procesar cada ficha una por una
      for (let i = 0; i < rows.length; i++) {
        setStatus(`Procesando ficha ${i + 1} de ${rows.length}...`);
        const fldsStr = rows[i][0] as string;
        const fields = fldsStr.split('\x1f'); // Anki separa campos con 0x1F

        let front = fields[0] || '';
        let back = fields[1] || '';

        let imagenRef: string | null = null;
        let audioRef: string | null = null;

        // --- Audios [sound:nombre.mp3] ---
        const audioMatch = front.match(/\[sound:(.*?)\]/) || back.match(/\[sound:(.*?)\]/);
        if (audioMatch) {
          const audioFilename = audioMatch[1];
          const zipKey = reverseMediaMap[audioFilename] || audioFilename;
          const audioZipEntry = zip.file(zipKey);

          if (audioZipEntry) {
            setStatus(`Subiendo audio: ${audioFilename}...`);
            const audioBlob = await audioZipEntry.async('blob');
            audioRef = await uploadAudio(audioBlob);
            totalMediaUploaded++;
          }
          front = front.replace(/\[sound:.*?\]/g, '');
          back = back.replace(/\[sound:.*?\]/g, '');
        }

        // --- Imágenes <img src="nombre.png"> ---
        const imgMatch = front.match(/<img[^>]+src=["']([^"']+)["']/i) || back.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) {
          const imgFilename = imgMatch[1];
          const zipKey = reverseMediaMap[imgFilename] || imgFilename;
          const imgZipEntry = zip.file(zipKey);

          if (imgZipEntry) {
            setStatus(`Subiendo imagen: ${imgFilename}...`);
            const imgBlob = await imgZipEntry.async('blob');
            imagenRef = await uploadImage(imgBlob);
            totalMediaUploaded++;
          }
          front = front.replace(/<img[^>]*>/gi, '');
          back = back.replace(/<img[^>]*>/gi, '');
        }

        // Limpieza de código HTML y etiquetas de Anki
        const cleanedFront = he.decode(front.replace(/<[^>]+>/g, '')).trim();
        const cleanedBack = he.decode(back.replace(/<[^>]+>/g, '')).trim();

        if (cleanedFront || cleanedBack) {
          const { error } = await supabase.from('flashcards').insert({
            user_id: user.id,
            pregunta: cleanedFront,
            respuesta: cleanedBack,
            imagen_ref: imagenRef,
            audio_ref: audioRef,
            interval: 0,
            repetition: 0,
            efactor: 2.5,
            next_review: new Date().toISOString(),
          });

          if (error) {
            console.error('Error al insertar ficha en Supabase:', error);
          } else {
            totalImported++;
          }
        }
      }

      setStatus(`¡Importación completada con éxito! Se importaron ${totalImported} fichas y ${totalMediaUploaded} archivos multimedia.`);
      if (onImportSuccess) onImportSuccess();

    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message || 'Ocurrió un problema durante la importación.'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm dark:bg-gray-800 dark:border-gray-700">
      <h3 className="text-lg font-bold mb-2 text-gray-800 dark:text-white">
        Importar archivo .apkg (Anki)
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
        Selecciona tu mazo comprimido para cargar tus tarjetas con imágenes y audios.
      </p>

      <label className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-md cursor-pointer transition-colors disabled:opacity-50">
        {loading ? 'Procesando...' : 'Seleccionar .apkg'}
        <input
          type="file"
          accept=".apkg"
          onChange={handleFileUpload}
          disabled={loading}
          className="hidden"
        />
      </label>

      {status && (
        <div className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">
          {status}
        </div>
      )}
    </div>
  );
};
