// Traduce al español una palabra en inglés de una lectura, usando la frase donde aparece como contexto.
// Se llama desde la app al tocar una palabra:
//   supabase.functions.invoke('ia-traducir', { body: { palabra, frase, proveedor } })
// "proveedor" es 'openrouter' (por defecto) o 'gemini' (alternativa cuando OpenRouter no funciona o no tiene saldo).
//
// Despliegue:  supabase functions deploy ia-traducir
// Secretos:    OPENROUTER_API_KEY  (la misma que ya usas en ia-pregunta)
//              OPENROUTER_MODEL    (opcional; si no existe se usa openai/gpt-4o-mini)
//              GEMINI_API_KEY      (clave gratuita de Google AI Studio: https://aistudio.google.com/apikey)
//              GEMINI_MODEL        (opcional; si no existe se usa gemini-3.5-flash-lite)
// Seguridad:   verify_jwt activo por defecto: solo pueden llamarla usuarios con sesión iniciada.
// Las claves viven solo en Supabase (secretos): nunca llegan al navegador ni al APK.

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
  let proveedor: 'openrouter' | 'gemini' = 'openrouter';
  try {
    const body = await req.json();
    palabra = String(body.palabra ?? '').trim();
    frase = String(body.frase ?? '').trim();
    if (body.proveedor === 'gemini') proveedor = 'gemini';
  } catch {
    return reply({ ok: false, error: 'entrada', mensaje: 'La petición no es válida.' });
  }
  if (!palabra || palabra.length > 60) return reply({ ok: false, error: 'entrada', mensaje: 'Falta la palabra (máximo 60 letras).' });
  frase = frase.slice(0, 400);

  try {
    const texto = proveedor === 'gemini' ? await viaGemini(palabra, frase) : await viaOpenRouter(palabra, frase);
    const json = texto.match(/\{[\s\S]*\}/)?.[0];
    let traduccion = texto.trim();
    if (json) {
      try {
        traduccion = String(JSON.parse(json).traduccion ?? '').trim();
      } catch {
        /* se usa el texto tal cual */
      }
    }
    if (!traduccion) return reply({ ok: false, error: 'vacio', mensaje: 'La IA no devolvió una traducción.' });
    return reply({ ok: true, traduccion: traduccion.slice(0, 200), proveedor });
  } catch (e) {
    return reply({ ok: false, error: 'fallo', mensaje: (e as Error).message });
  }
});

const userText = (palabra: string, frase: string) => `Palabra: ${palabra}\nFrase: ${frase || palabra}`;

async function viaOpenRouter(palabra: string, frase: string): Promise<string> {
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('Falta el secreto OPENROUTER_API_KEY en Supabase.');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-title': 'SimulaPro' },
    body: JSON.stringify({
      model: Deno.env.get('OPENROUTER_MODEL') || 'openai/gpt-4o-mini',
      temperature: 0,
      max_tokens: 120,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userText(palabra, frase) },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenRouter no respondió: ${data?.error?.message ?? `error ${res.status}`}`);
  return String(data?.choices?.[0]?.message?.content ?? '');
}

async function viaGemini(palabra: string, frase: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('Falta el secreto GEMINI_API_KEY en Supabase (clave gratuita en https://aistudio.google.com/apikey).');
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: userText(palabra, frase) }] }],
      // Margen de sobra: algunos modelos gastan parte de los tokens "pensando" antes de responder
      generationConfig: { temperature: 0, maxOutputTokens: 512, responseMimeType: 'application/json' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini no respondió: ${data?.error?.message ?? `error ${res.status}`}`);
  const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('');
}
