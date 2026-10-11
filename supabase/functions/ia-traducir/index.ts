// Traduce al español una palabra en inglés de una lectura, usando la frase donde aparece como contexto.
// Se llama desde la app al tocar una palabra: supabase.functions.invoke('ia-traducir', { body: { palabra, frase } }).
//
// Despliegue:  supabase functions deploy ia-traducir
// Secretos:    OPENROUTER_API_KEY  (la misma que ya usas en ia-pregunta)
//              OPENROUTER_MODEL    (opcional: el modelo de OpenRouter; si no existe se usa openai/gpt-4o-mini)
// Seguridad:   verify_jwt activo por defecto: solo pueden llamarla usuarios con sesión iniciada.

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

// Siempre responde 200 con { ok, ... }: así la app recibe el mensaje de error en vez de un error genérico.
const reply = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { headers: { ...cors, 'content-type': 'application/json' } });

const SYSTEM = `Eres un diccionario inglés→español para estudiantes de nivel básico.
Te doy una palabra y la frase donde aparece. Responde SOLO un JSON con esta forma exacta:
{"traduccion":"..."}
La traducción debe corresponder al uso de la palabra en ESA frase: una a tres opciones cortas separadas por coma.
Los verbos van en infinitivo (ej. "correr"); si ayuda, añade la categoría entre paréntesis (ej. "banco (sustantivo)").
Sin explicaciones ni texto fuera del JSON.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ ok: false, error: 'metodo', mensaje: 'Método no permitido.' });

  let palabra = '';
  let frase = '';
  try {
    const body = await req.json();
    palabra = String(body.palabra ?? '').trim();
    frase = String(body.frase ?? '').trim();
  } catch {
    return reply({ ok: false, error: 'entrada', mensaje: 'La petición no es válida.' });
  }
  if (!palabra || palabra.length > 60) return reply({ ok: false, error: 'entrada', mensaje: 'Falta la palabra (máximo 60 letras).' });
  frase = frase.slice(0, 400);

  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) return reply({ ok: false, error: 'sin_clave', mensaje: 'Falta el secreto OPENROUTER_API_KEY en Supabase.' });

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-title': 'SimulaPro' },
      body: JSON.stringify({
        model: Deno.env.get('OPENROUTER_MODEL') || 'openai/gpt-4o-mini',
        temperature: 0,
        max_tokens: 120,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Palabra: ${palabra}\nFrase: ${frase || palabra}` },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const detalle = data?.error?.message ?? `OpenRouter respondió ${res.status}`;
      return reply({ ok: false, error: 'openrouter', mensaje: `La IA no respondió: ${detalle}` });
    }
    const texto: string = data?.choices?.[0]?.message?.content ?? '';
    const json = texto.match(/\{[\s\S]*\}/)?.[0];
    const traduccion = json ? String(JSON.parse(json).traduccion ?? '').trim() : texto.trim();
    if (!traduccion) return reply({ ok: false, error: 'vacio', mensaje: 'La IA no devolvió una traducción.' });
    return reply({ ok: true, traduccion: traduccion.slice(0, 200) });
  } catch (e) {
    return reply({ ok: false, error: 'fallo', mensaje: `No se pudo traducir: ${(e as Error).message}` });
  }
});
