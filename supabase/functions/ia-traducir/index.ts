// Traduce al español una palabra, una expresión (phrasal verb, modismo) o una frase corta en inglés de una lectura,
// usando la frase donde aparece como contexto. Se llama desde la app al tocar o seleccionar texto:
//   supabase.functions.invoke('ia-traducir', { body: { palabra, frase, proveedor } })
// "proveedor" es la IA que se prefiere: 'openrouter' (por defecto) o 'gemini'. Si esa falla se prueba la otra
// automáticamente; si fallan las dos, el mensaje de error explica el motivo de cada una.
//
// Despliegue:  supabase functions deploy ia-traducir
// Secretos:    OPENROUTER_API_KEY  (la misma que ya usas en ia-pregunta)
//              OPENROUTER_MODEL    (opcional; si no existe se usa openrouter/free, el mismo modelo gratuito que ia-pregunta)
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
Te doy una palabra, una expresión o una frase corta, y la frase donde aparece. Responde SOLO un JSON con esta forma exacta:
{"traduccion":"..."}
La traducción debe corresponder al uso en ESA frase.
- Una palabra: una a tres opciones cortas separadas por coma. Los verbos van en infinitivo (ej. "correr"); si ayuda, añade la categoría entre paréntesis (ej. "banco (sustantivo)").
- Una expresión (phrasal verb como "give up" o "look forward to", modismo, locución): traduce el significado de TODA la expresión, no palabra por palabra (ej. "rendirse", "tener ganas de"). Si es un verbo, en infinitivo.
- Una frase de varias palabras: su traducción natural al español, sin comentarios.
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
  if (!palabra || palabra.length > 160) return reply({ ok: false, error: 'entrada', mensaje: 'Falta la palabra o frase (máximo 160 letras).' });
  frase = frase.slice(0, 400);

  // Prueba primero la IA elegida y, si falla, la otra. Si fallan las dos, el mensaje cuenta POR QUÉ falló cada una.
  const orden: ('openrouter' | 'gemini')[] = proveedor === 'gemini' ? ['gemini', 'openrouter'] : ['openrouter', 'gemini'];
  const fallos: string[] = [];
  for (const p of orden) {
    try {
      const texto = p === 'gemini' ? await viaGemini(palabra, frase) : await viaOpenRouter(palabra, frase);
      const traduccion = extraerTraduccion(texto);
      if (!traduccion) {
        fallos.push(`${p === 'gemini' ? 'Gemini' : 'OpenRouter'}: no devolvió una traducción.`);
        continue;
      }
      return reply({ ok: true, traduccion: traduccion.slice(0, 400), proveedor: p, pedido: proveedor });
    } catch (e) {
      fallos.push((e as Error).message);
    }
  }
  return reply({ ok: false, error: 'fallo', mensaje: fallos.join('\n') });
});

function extraerTraduccion(texto: string): string {
  const json = texto.match(/\{[\s\S]*\}/)?.[0];
  if (json) {
    try {
      return String(JSON.parse(json).traduccion ?? '').trim();
    } catch {
      /* se usa el texto tal cual */
    }
  }
  return texto.trim();
}

const userText = (palabra: string, frase: string) => `Palabra o expresión: ${palabra}\nFrase: ${frase || palabra}`;

async function viaOpenRouter(palabra: string, frase: string): Promise<string> {
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('Falta el secreto OPENROUTER_API_KEY en Supabase.');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-title': 'SimulaPro' },
    body: JSON.stringify({
      model: Deno.env.get('OPENROUTER_MODEL') || 'openrouter/free',
      temperature: 0,
      max_tokens: 300,
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
