// Fallback IA para el Formato 3 (texto desordenado). Solo se llama con bloques de baja confianza.
// Despliegue: supabase functions deploy ai-import
// Secretos:   supabase secrets set ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=<id-del-modelo>
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { text } = await req.json(); // verify_jwt activo por defecto: solo usuarios logueados
  if (typeof text !== 'string' || !text.trim()) {
    return new Response('[]', { headers: { 'content-type': 'application/json' } });
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL'),
      max_tokens: 4000,
      system: `Convierte texto de estudio en preguntas. Responde SOLO un JSON array.
Cada item: {"type":"multiple_choice|true_false|fill_blank|short_answer","prompt":string,
"options":[{"id":"a","text":string}]|null,
"answer": {"correct":[ids]} | {"value":bool} | {"blanks":[[string]]} | {"accepted":[string]},
"explanation":string|null}. En fill_blank usa {{1}},{{2}} para los huecos. No inventes respuestas:
si no se puede inferir, omite la pregunta.`,
      messages: [{ role: 'user', content: text.slice(0, 20000) }],
    }),
  });

  const data = await res.json();
  return new Response(data.content?.[0]?.text ?? '[]', {
    headers: { 'content-type': 'application/json' },
  });
});
