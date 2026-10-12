// Entrega un archivo (imagen o audio) de un simulacro COMPARTIDO por enlace.
// Se llama desde la app: POST { short_id, file_id }  →  bytes del archivo.
// Sirve para (1) que quien abre /s/<enlace> vea las imágenes y (2) que quien pulsa "Guardar en mi cuenta" las copie
// a su propio Drive.
//
// Seguridad: solo entrega un archivo si pertenece a una pregunta de un simulacro con enlace ACTIVO (lo comprueba la
// función SQL shared_file_allowed). Con el enlace desactivado deja de entregar. Nunca usa tu permiso de Google.
// Requisito: al compartir, la app deja los archivos del creador "con acceso para cualquiera que tenga el enlace".
//
// Despliegue:  supabase functions deploy drive-public
// Secretos:    SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen por defecto en Supabase.
//              GOOGLE_API_KEY (opcional): clave de API de Google Cloud con "Google Drive API" activada.
//              Si existe, se usa la API oficial; si no, se usa la descarga pública de Drive.

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const fail = (status: number, mensaje: string) =>
  new Response(JSON.stringify({ ok: false, mensaje }), { status, headers: { ...cors, 'content-type': 'application/json' } });

const MAX_BYTES = 15 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'Método no permitido.');

  let shortId = '';
  let fileId = '';
  try {
    const b = await req.json();
    shortId = String(b.short_id ?? '');
    fileId = String(b.file_id ?? '');
  } catch {
    return fail(400, 'La petición no es válida.');
  }
  if (!/^[A-Za-z0-9]{4,32}$/.test(shortId) || !/^[A-Za-z0-9_-]{10,120}$/.test(fileId)) return fail(400, 'Datos no válidos.');

  // ¿Este archivo pertenece a un simulacro con enlace activo?
  const base = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !service) return fail(500, 'Faltan los secretos de Supabase en la función.');
  const chk = await fetch(`${base}/rest/v1/rpc/shared_file_allowed`, {
    method: 'POST',
    headers: { apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_short: shortId, p_file: fileId }),
  });
  if (!chk.ok) return fail(500, 'No se pudo comprobar el enlace.');
  if ((await chk.json()) !== true) return fail(404, 'Archivo no disponible en este enlace.');

  // Descarga desde Drive (el archivo debe estar compartido "para cualquiera con el enlace")
  const apiKey = Deno.env.get('GOOGLE_API_KEY');
  const url = apiKey
    ? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`
    : `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  let up: Response;
  try {
    up = await fetch(url, { redirect: 'follow' });
  } catch {
    return fail(502, 'No se pudo contactar a Google Drive.');
  }
  if (!up.ok) return fail(up.status === 404 || up.status === 403 ? 404 : 502, 'El archivo no es accesible: el creador debe volver a compartir el enlace.');
  const type = up.headers.get('content-type') ?? 'application/octet-stream';
  // Si Drive devuelve una página web (archivo privado, aviso de Google…), no es el archivo
  if (type.startsWith('text/') || type.includes('json')) return fail(404, 'El archivo no es accesible: el creador debe volver a compartir el enlace.');
  const bytes = new Uint8Array(await up.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return fail(413, 'El archivo está vacío o es demasiado grande.');
  return new Response(bytes, { headers: { ...cors, 'content-type': type, 'cache-control': 'private, max-age=3600' } });
});
