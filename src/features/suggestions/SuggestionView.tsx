import ReactMarkdown from 'react-markdown';

/** Muestra Markdown con el estilo de la app. No admite HTML crudo (react-markdown lo ignora): es seguro con texto de IA. */
export default function SuggestionView({ content }: { content: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          h1: (p) => <h1 className="text-xl font-extrabold" {...p} />,
          h2: (p) => <h2 className="mt-5 text-lg font-extrabold text-sky-600 dark:text-sky-400" {...p} />,
          h3: (p) => <h3 className="mt-4 font-extrabold" {...p} />,
          p: (p) => <p {...p} />,
          ul: (p) => <ul className="list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="list-decimal space-y-1 pl-5" {...p} />,
          a: ({ href, ...p }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="font-bold text-sky-600 underline dark:text-sky-400" {...p} />
          ),
          code: (p) => <code className="rounded bg-slate-200 px-1 dark:bg-slate-700" {...p} />,
          hr: () => <hr className="border-slate-300 dark:border-slate-700" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
