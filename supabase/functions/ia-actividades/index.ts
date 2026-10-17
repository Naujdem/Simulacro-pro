// Actividades de comprensión para un capítulo de un libro en inglés (como las de los libros de texto de inglés):
// preguntas de opción múltiple, verdadero/falso, vocabulario clave y preguntas para conversar o escribir.
// Se llama desde el lector de libros al terminar un capítulo:
//   supabase.functions.invoke('ia-actividades', { body: { titulo, capitulo, texto, proveedor } })
// "proveedor" es la IA que se prefiere: 'openrouter' (por defecto) o 'gemini'. Si esa falla se prueba la otra
// automáticamente; si fallan las dos, el mensaje de error explica el motivo de cada una.
//
// Despliegue:  supabase functions deploy ia-actividades   (o pegar este archivo en el panel de Supabase > Edge Functions)
// Secretos:    los mismos que ia-traducir: OPENROUTER_API_KEY, OPENROUTER_MODEL (opcional, por defecto openrouter/free),
//              GEMINI_API_KEY, GEMINI_MODEL (opcional, por defecto gemini-3.5-flash-lite)
// Seguridad:   verify_jwt activo por defecto: solo pueden llamarla usuarios con sesión iniciada.
// Las claves viven solo en Supabase (secretos): nunca llegan al navegador ni al APK.
// La app revisa y limpia lo que devuelve la IA (src/features/books/activities.ts); aquí solo se comprueba que sea un JSON.

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

// Siempre responde 200 con { ok, ... }: así la app recibe el mensaje de error en vez de un error genérico.
const reply = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { headers: { ...cors, 'content-type': 'application/json' } });

const SYSTEM = `Eres un profesor de inglés que crea actividades de comprensión para estudiantes hispanohablantes de nivel básico (A1-A2).
Te doy un capítulo de un libro en inglés. Responde SOLO un JSON con esta forma exacta:
{
 "comprension":[{"pregunta":"...","opciones":["...","...","..."],"correcta":0,"explicacion":"..."}],
 "verdadero_falso":[{"afirmacion":"...","verdadero":true,"explicacion":"..."}],
 "vocabulario":[{"palabra":"...","traduccion":"..."}],
 "conversacion":["...","..."]
}
Reglas:
- comprension: 4 preguntas con 3 opciones cada una; solo una es correcta y "correcta" es su posición empezando en 0. Pregunta y opciones en inglés sencillo, basadas SOLO en el texto.
- verdadero_falso: 3 afirmaciones en inglés sencillo sobre lo que dice el texto; mezcla verdaderas y falsas.
- vocabulario: 5 palabras o expresiones útiles que aparezcan en el texto (no las más básicas como "the" o "is"), en su forma base, con su traducción al español en 1 a 3 opciones cortas.
- conversacion: 2 preguntas abiertas en inglés sencillo para conversar o escribir una respuesta corta, relacionadas con el texto y con la vida del estudiante.
- Las explicaciones van en español y tienen una sola frase corta.
Sin texto fuera del JSON.`;

type Proveedor = 'openrouter' | 'gemini';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ ok: false, error: 'metodo', mensaje: 'Método no permitido.' });

  let titulo = '';
  let capitulo = '';
  let texto = '';
  let proveedor: Proveedor = 'openrouter';
  try {
    const body = await req.json();
    titulo = String(body.titulo ?? '').trim().slice(0, 200);
    capitulo = String(body.capitulo ?? '').trim().slice(0, 200);
    texto = String(body.texto ?? '').trim().slice(0, 9000);
    if (body.proveedor === 'gemini') proveedor = 'gemini';
  } catch {
    return reply({ ok: false, error: 'entrada', mensaje: 'La petición no es válida.' });
  }
  if (texto.length < 80) return reply({ ok: false, error: 'entrada', mensaje: 'El capítulo tiene muy poco texto para crear actividades.' });

  const prompt = `Libro: ${titulo || '(sin título)'}\nCapítulo: ${capitulo || '(sin título)'}\n\nTexto:\n${texto}`;

  // Prueba primero la IA elegida y, si falla, la otra. Si fallan las dos, el mensaje cuenta POR QUÉ falló cada una.
  const orden: Proveedor[] = proveedor === 'gemini' ? ['gemini', 'openrouter'] : ['openrouter', 'gemini'];
  const fallos: string[] = [];
  for (const p of orden) {
    const nombre = p === 'gemini' ? 'Gemini' : 'OpenRouter';
    try {
      const salida = p === 'gemini' ? await viaGemini(prompt) : await viaOpenRouter(prompt);
      const actividades = extraerJson(salida);
      if (!actividades) {
        fallos.push(`${nombre}: no devolvió actividades en el formato esperado.`);
        continue;
      }
      return reply({ ok: true, actividades, proveedor: p, pedido: proveedor });
    } catch (e) {
      fallos.push((e as Error).message);
    }
  }
  return reply({ ok: false, error: 'fallo', mensaje: fallos.join('\n') });
});

function extraerJson(texto: string): Record<string, unknown> | null {
  const json = texto.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

async function viaOpenRouter(prompt: string): Promise<string> {
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('Falta el secreto OPENROUTER_API_KEY en Supabase.');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-title': 'SimulaPro' },
    body: JSON.stringify({
      model: Deno.env.get('OPENROUTER_MODEL') || 'openrouter/free',
      temperature: 0.4,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenRouter no respondió: ${data?.error?.message ?? `error ${res.status}`}`);
  return String(data?.choices?.[0]?.message?.content ?? '');
}

async function viaGemini(prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('Falta el secreto GEMINI_API_KEY en Supabase (clave gratuita en https://aistudio.google.com/apikey).');
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // Margen de sobra: algunos modelos gastan parte de los tokens "pensando" antes de responder
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini no respondió: ${data?.error?.message ?? `error ${res.status}`}`);
  const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('');
}
