import type { SVGProps } from 'react';

/** Iconos de línea (24×24, trazo que hereda el color del texto). Sustituyen a los emojis de la interfaz. */
const PATHS = {
  home: ['M3 11.5 12 4l9 7.5', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  book: ['M6 3h13v15H6a2 2 0 0 0-2 2V5a2 2 0 0 1 2-2z', 'M4 20a2 2 0 0 0 2 2h13v-4'],
  cards: ['M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M7 6V4a1 1 0 0 1 1-1h11a2 2 0 0 1 2 2v11a1 1 0 0 1-1 1h-2'],
  chart: ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'],
  user: ['M4 21a8 8 0 0 1 16 0', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  plus: ['M12 5v14', 'M5 12h14'],
  flame: ['M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2-.5-3 0-5 1-8z'],
  more: ['M12 5.5v.01', 'M12 12v.01', 'M12 18.5v.01'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  folder: ['M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  folderPlus: ['M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M12 10.5v5', 'M9.5 13h5'],
  bolt: ['M13 2 4 14h7l-1 8 9-12h-7z'],
  dice: ['M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z', 'M9 9v.01', 'M15 9v.01', 'M9 15v.01', 'M15 15v.01'],
  bookmark: ['M6 3h12v18l-6-4-6 4z'],
  chevron: ['M9 6l6 6-6 6'],
  play: ['M7 4l13 8-13 8z'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  repeat: ['M17 2l4 4-4 4', 'M3 11V9a3 3 0 0 1 3-3h15', 'M7 22l-4-4 4-4', 'M21 13v2a3 3 0 0 1-3 3H3'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  sun: ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  expand: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  moon: ['M20 14a8 8 0 1 1-10-10 6 6 0 0 0 10 10z'],
  library: ['M3 4h4v16H3z', 'M9 4h4v16H9z', 'M15.2 5.4l3.8-1 2.8 14.8-3.8 1z'],
  monitor: ['M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8 21h8', 'M12 16v5'],
} as const;

export type IconName = keyof typeof PATHS;

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 20, strokeWidth = 1.75, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
