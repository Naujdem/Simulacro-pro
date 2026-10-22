type Props = {
  value: number | null;
  onChange: (stars: number | null) => void;
  disabled?: boolean;
  label?: string;
};

/** Estrellas de 1 a 5. Tocar la estrella ya elegida quita la calificación. */
export default function StarRating({ value, onChange, disabled, label = 'Dificultad' }: Props) {
  return (
    <div role="radiogroup" aria-label={label} className="flex justify-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value !== null && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
            disabled={disabled}
            onClick={() => onChange(value === n ? null : n)}
            className={`p-1 text-3xl leading-none transition active:scale-90 disabled:opacity-50 ${on ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600'}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
