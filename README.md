# SimulaPro

App de simulacros y práctica de preguntas (React + Vite + Tailwind + Supabase, PWA).

## Puesta en marcha

1. **Instalar:** `npm install`
2. **Crear proyecto en [Supabase](https://supabase.com)** y ejecutar `supabase/migrations/0001_init.sql` en *SQL Editor*.
3. **Variables:** copia `.env.example` a `.env` y pon tu `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Project Settings → API).
4. **Auth:**
   - Email: *Authentication → Providers → Email* (puedes desactivar "Confirm email" en desarrollo).
   - Google: *Providers → Google*, con tu Client ID/Secret de Google Cloud. En *URL Configuration* añade `http://localhost:5173` y tu dominio de producción como Redirect URLs.
5. **Ejecutar:** `npm run dev`

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests del parser y la corrección |
| `npm run build` | Typecheck + build de producción (con PWA) |

## Estructura

```
src/lib/importParser.ts   parser texto → preguntas (con confianza y avisos)
src/lib/grading.ts        corrección de respuestas (tolera tildes y 1 typo)
src/features/practice/    store (Zustand) + QuestionCard + página de práctica
src/features/import/      importador con vista previa editable
supabase/migrations/      esquema, RLS, RPC record_study, vista subject_stats
supabase/functions/ai-import/  fallback IA (opcional, Fase 4)
```

## Fallback IA (opcional)

```
supabase functions deploy ai-import
supabase secrets set ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=<id-del-modelo>
```

Aún no está conectada a la pantalla de importación: el parser local cubre los formatos 1 y 2.

## Pendiente / siguientes pasos

- Conectar `ai-import` para bloques con `confidence < 0.6` y validar su JSON con Zod.
- Editor de carpetas (la tabla `folders` ya existe; hoy se organiza por tema).
- Heatmap de racha y meta diaria (columna `daily_goal` ya creada).
- Modo offline (Dexie + cola de escritura) y preguntas de ordenar.
- Endurecer RLS de `profiles` para que el cliente no pueda editar `xp`/`streak` directamente (hoy solo `record_study` debería hacerlo).
