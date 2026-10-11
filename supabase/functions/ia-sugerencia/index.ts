// Sugerencia de estudio personalizada a partir de las preguntas que el usuario falló en un simulacro.
// Se llama desde la pantalla de resultados:
//   supabase.functions.invoke('ia-sugerencia', { body: { titulo, secciones, falladas, proveedor } })
// Prueba primero OpenRouter y, si falla, Gemini (o al revés si proveedor = 'gemini'). Devuelve Markdown.
//
// Despliegue:  supabase functions deploy ia-sugerencia   (o pegar este archivo en el panel de Supabase)
// Secretos:    los mismos que ia-traducir: OPENROUTER_API_KEY, OPENROUTER_MODEL (opcional, por defecto openrouter/free),
//              GEMINI_API_KEY, GEMINI_MODEL (opcional, por defecto gemini-3.5-flash-lite)
// Seguridad:   verify_jwt activo por defecto: solo usuarios con sesión iniciada. Las claves nunca llegan al navegador.

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

// Siempre responde 200 con { ok, ... } para que la app reciba el mensaje de error en vez de un error genérico.
const reply = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { headers: { ...cors, 'content-type': 'application/json' } });

interface Fallada {
  pregunta: string;
  correcta: string;
  explicacion?: string;
  seccion?: string;
}

const SYSTEM = `Eres un tutor experto que prepara sugerencias de estudio en español para un estudiante.
Responde SOLO con Markdown (sin bloques de código que envuelvan todo el texto) y con esta estructura:

# Sugerencia de estudio: <tema principal>

## Temas a repasar
### 1. <tema> (fallaste N preguntas)
- **Qué repasar:** mini-resumen de 2-3 líneas.
- **Ejemplo:** 1-2 ejemplos relacionados.
- **Video:** enlace de búsqueda de YouTube (ver reglas).
- **Ejercicio:** 3 a 5 ejercicios de práctica nuevos, numerados, con la solución al final de la lista entre paréntesis o en cursiva.
(repite para cada tema; agrupa errores parecidos en un mismo tema)

## Plan de estudio
- **Día 1:** ...
- **Día 2:** ...
- **Día 3:** ...

## Recursos adicionales
- lista de enlaces (ver reglas)

REGLAS PARA LOS ENLACES (importante, no inventes direcciones):
- Para videos usa SIEMPRE enlaces de búsqueda de YouTube con este formato: [texto](https://www.youtube.com/results?search_query=palabras+de+busqueda).
- Para artículos o ejercicios usa SOLO la página principal de sitios muy conocidos y estables (por ejemplo https://learnenglish.britishcouncil.org, https://www.khanacademy.org/, https://www.perfect-english-grammar.com/, https://es.wikipedia.org/) o un enlace de búsqueda en ellos. Nunca inventes rutas profundas que no estés seguro de que existen.
Sé conciso, directo y motivador. Escribe en español; si el tema es inglés, los ejemplos van en inglés.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ ok: false, error: 'metodo', mensaje: 'Método no permitido.' });

  let titulo = '';
  let secciones: string[] = [];
  let falladas: Fallada[] = [];
  let proveedor: 'openrouter' | 'gemini' = 'openrouter';
  try {
    const body = await req.json();
    titulo = String(body.titulo ?? '').trim().slice(0, 200);
    secciones = Array.isArray(body.secciones) ? body.secciones.map((s: unknown) => String(s).slice(0, 80)).slice(0, 20) : [];
    falladas = (Array.isArray(body.falladas) ? body.falladas : []).slice(0, 25).map((f: Record<string, unknown>) => ({
      pregunta: String(f.pregunta ?? '').slice(0, 500),
      correcta: String(f.correcta ?? '').slice(0, 300),
      explicacion: f.explicacion ? String(f.explicacion).slice(0, 400) : undefined,
      seccion: f.seccion ? String(f.seccion).slice(0, 80) : undefined,
    }));
    if (body.proveedor === 'gemini') proveedor = 'gemini';
  } catch {
    return reply({ ok: false, error: 'entrada', mensaje: 'La petición no es válida.' });
  }
  if (!falladas.length) return reply({ ok: false, error: 'entrada', mensaje: 'No hay preguntas falladas.' });

  const lista = falladas
    .map(
      (f, i) =>
        `${i + 1}. ${f.pregunta}\n   Respuesta correcta: ${f.correcta}` +
        (f.explicacion ? `\n   Explicación: ${f.explicacion}` : '') +
        (f.seccion ? `\n   Sección: ${f.seccion}` : ''),
    )
    .join('\n');
  const user = `Contexto: simulacro "${titulo || 'sin título'}"${secciones.length ? `, secciones: ${secciones.join(', ')}` : ''}.
El usuario falló estas ${falladas.length} preguntas:

${lista}

Genera la sugerencia de estudio personalizada.`;

  const orden: ('openrouter' | 'gemini')[] = proveedor === 'gemini' ? ['gemini', 'openrouter'] : ['openrouter', 'gemini'];
  const fallos: string[] = [];
  for (const p of orden) {
    try {
      const texto = (p === 'gemini' ? await viaGemini(user) : await viaOpenRouter(user)).trim();
      if (texto.length < 80) {
        fallos.push(`${p === 'gemini' ? 'Gemini' : 'OpenRouter'}: devolvió una respuesta vacía o demasiado corta.`);
        continue;
      }
      return reply({ ok: true, markdown: texto, proveedor: p, pedido: proveedor });
    } catch (e) {
      fallos.push((e as Error).message);
    }
  }
  return reply({ ok: false, error: 'fallo', mensaje: fallos.join('\n') });
});

async function viaOpenRouter(user: string): Promise<string> {
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('Falta el secreto OPENROUTER_API_KEY en Supabase.');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-title': 'SimulaPro' },
    body: JSON.stringify({
      model: Deno.env.get('OPENROUTER_MODEL') || 'openrouter/free',
      temperature: 0.4,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenRouter no respondió: ${data?.error?.message ?? `error ${res.status}`}`);
  return String(data?.choices?.[0]?.message?.content ?? '');
}

async function viaGemini(user: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('Falta el secreto GEMINI_API_KEY en Supabase (clave gratuita en https://aistudio.google.com/apikey).');
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini no respondió: ${data?.error?.message ?? `error ${res.status}`}`);
  const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('');
}
