/** Primer encabezado "# ..." del Markdown como título; si no hay, usa el del simulacro. */
export function titleFrom(markdown: string, fallback: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  const t = (m?.[1] ?? '').replace(/[*_`]/g, '').trim();
  return (t || fallback).slice(0, 160);
}

/** Quita una cerca ```markdown que algunos modelos ponen alrededor de toda la respuesta. */
export function cleanMarkdown(text: string): string {
  const m = text.trim().match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return (m ? m[1] : text).trim();
}
