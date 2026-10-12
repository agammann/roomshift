import type { CSSProperties, ReactNode } from 'react';

export type IconName = 'room' | 'export' | 'headset' | 'plus' | 'undo' | 'redo' | 'compare' | 'chevron' | 'close' | 'trash' | 'rotate-left' | 'rotate-right' | 'help' | 'image' | 'check' | 'sofa' | 'chair' | 'table' | 'shelf' | 'art';

const paths: Record<IconName, ReactNode> = {
  room: <><path d="M3 7 10 3l12 5v14H3Z"/><path d="M10 3v15l12 4M10 18H7V5"/></>,
  export: <><path d="M12 16V3m-4 4 4-4 4 4M4 12v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8"/></>,
  headset: <><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4l-4-4-4 4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><circle cx="7" cy="10" r="1.5"/><circle cx="17" cy="10" r="1.5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  undo: <><path d="m8 4-5 5 5 5M3 9h11a6 6 0 1 1 0 12h-3"/></>,
  redo: <><path d="m16 4 5 5-5 5m5-5H10a6 6 0 1 0 0 12h3"/></>,
  compare: <><rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/></>,
  chevron: <path d="m7 10 5 5 5-5"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  trash: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></>,
  'rotate-left': <><path d="m9 2-4 4 4 4M5 6h7a8 8 0 1 1-8 8"/></>,
  'rotate-right': <><path d="m15 2 4 4-4 4m4-4h-7a8 8 0 1 0 8 8"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .5-1.5 1-1.5 2M12 17h.01"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  sofa: <><path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M3 11h3v5h12v-5h3v8H3ZM5 19v2m14-2v2"/></>,
  chair: <><path d="M7 13V5h10v8M5 13h14v5H5Zm2 5v3m10-3v3"/></>,
  table: <><path d="M3 8h18v4H3Zm3 4v9m12-9v9"/></>,
  shelf: <><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M5 9h14M5 15h14M9 4v4m4-4v4M9 10v4m6-4v4M10 16v4"/></>,
  art: <><rect x="3" y="3" width="18" height="18"/><path d="M6 6h12v12H6Z"/><circle cx="14" cy="10" r="2"/><path d="m6 17 5-6 4 7"/></>,
};

export function Icon({ name, size = 20, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name]}</svg>;
}
