import type { SVGProps } from 'react';

const PATHS: Record<string, string> = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.6-3.6',
  plus: 'M12 5v14M5 12h14',
  pin: 'M9 3h6l-1 6 3 3H7l3-3-1-6ZM12 12v8',
  trash: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6',
  copy: 'M9 9V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3M4 11a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7Z',
  download: 'M12 4v10M8 11l4 4 4-4M5 19h14',
  upload: 'M12 20V10M8 13l4-4 4 4M5 5h14',
  mic: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM5 11a7 7 0 0 0 14 0M12 18v3M9 21h6',
  stop: 'M7 7h10v10H7z',
  check: 'M5 13l4 4L19 7',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
  bell: 'M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16l-2-3ZM10 22h4',
  x: 'M6 6l12 12M18 6 6 18',
  settings: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M15 5v4M9 10v4M17 15v4',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  listOrdered: 'M10 6h10M10 12h10M10 18h10M4 5h1v4M4 15h2M4 18h2v-2H4',
  quote: 'M9 7H5v6h4l-2 4M19 7h-4v6h4l-2 4',
  undo: 'M9 14 4 9l5-5M4 9h9a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9h-9a6 6 0 0 0 0 12h3',
  sparkles: 'M12 3l1.6 4L18 8.5l-4.4 1.6L12 14.5l-1.6-4.4L6 8.5l4.4-1.5L12 3ZM19 14l.8 2 2 .8-2 .8L19 20l-.8-2.4-2-.8 2-.8L19 14Z',
  note: 'M6 3h12a1 1 0 0 1 1 1v16l-4-2.5L11 20l-4-2.5V4a1 1 0 0 1 1-1ZM9 8h6M9 12h4',
  book: 'M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2V5ZM13 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6M12 7.5v.01',
  alert: 'M12 3 2 21h20L12 3ZM12 10v5M12 18v.01',
  wand: 'M5 19 17 7M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2ZM20 12l.7 1.3L22 14l-1.3.7L20 16l-.7-1.3L18 14l1.3-.7L20 12Z',
  pen: 'M4 20h4L20 8l-4-4L4 16v4ZM14 6l4 4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4 12H2M22 12h-2M6 6 4.5 4.5M19.5 19.5 18 18M18 6l1.5-1.5M4.5 19.5 6 18',
  send: 'M4 12l16-8-6 16-3-6-7-2Z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  board: 'M4 5h16v11H4zM8 20h8M12 16v4',
  panelLeft: 'M3 4h18v16H3zM9 4v16M6 9h.01M6 12h.01',
  panelRight: 'M3 4h18v16H3zM15 4v16M18 9h.01M18 12h.01',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  palette:
    'M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3ZM7.5 10h.01M10 7h.01M14 7h.01M16.5 10h.01',
  type: 'M5 7V5h14v2M12 5v14M9 19h6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  brush: 'M14 4l6 6-9 9-4 1 1-4 9-9ZM4 21c2 0 3-1 4-3M15 5l4 4',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z',
  folderOpen: 'M3 7a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v2M3 7v12a1 1 0 0 0 1 1h14l3-9H6l-3 9',
  folderPlus: 'M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6ZM12 11v6M9 14h6',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  fullscreenExit: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  edit: 'M4 20h4L20 8l-4-4L4 16v4ZM14 6l4 4',
  retell: 'M4 5h16M4 10h11M4 15h7M18 11v7M15 15l3 3 3-3',
  lock: 'M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5zM12 15v2',
  key: 'M14 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM14 7l6-4M17 4l2 2M19 2l2 2',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5h.01',
  eraser: 'M4 16l7-7 6 6-5 5H7l-3-4ZM14 6l4 4M9 21h11',
  marker: 'M15 3l6 6-8 8H7v-6l8-8ZM8 18l-3 3',
  languages: 'M3 5h8M7 3v2M4.5 8c.8 3.5 3.2 6.3 6.4 7.5M11 5c-.4 3.4-2.7 6.7-5.5 8.5M13 20l4-10 4 10M14.5 16.5h5',
  volume: 'M4 9v6h4l5 4V5L8 9H4ZM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  volumeOff: 'M4 9v6h4l5 4V5L8 9H4ZM17 9l4 6M21 9l-4 6',
  play: 'M8 5l11 7-11 7V5Z',
  pause: 'M9 5v14M15 5v14',
  outline: 'M4 5h4M4 12h4M4 19h4M10 5h10M10 12h10M10 19h10',
  minimize: 'M5 12h14',
  maximize: 'M5 5h14v14H5z',
  restore: 'M8 8h11v11H8zM5 16V5h11',
};

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, strokeWidth = 1.8, ...rest }: IconProps) {
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
      <path d={PATHS[name]} />
    </svg>
  );
}
