// Minimal inline icon set — one stroke style, 20px grid.
const base = {
  width: 20, height: 20, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round",
} as const;

export const HomeIcon = () => (
  <svg {...base}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>
);
export const FlameIcon = () => (
  <svg {...base}><path d="M12 22c4.4 0 7-2.8 7-6.5 0-3-1.8-4.9-3.2-6.6C14.5 7.3 13.6 5.4 14 3c-3.7 1.6-5 4.6-4.6 7.2-1-.3-1.8-1-2.2-2.2C5.6 9.6 5 11.6 5 13.5 5 19.2 7.6 22 12 22Z" /></svg>
);
export const RocketIcon = () => (
  <svg {...base}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);
export const TrophyIcon = () => (
  <svg {...base}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4a3 3 0 0 0 3 5" /><path d="M17 6h3a3 3 0 0 1-3 5" /></svg>
);
export const UserIcon = () => (
  <svg {...base}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" /></svg>
);
export const GearIcon = () => (
  <svg {...base}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M4.2 6.5l2.6 1.5M17.2 16l2.6 1.5M4.2 17.5 6.8 16M17.2 8l2.6-1.5" /></svg>
);
export const ShieldIcon = () => (
  <svg {...base}><path d="M12 3 5 6v5c0 5 3 8.4 7 10 4-1.6 7-5 7-10V6l-7-3Z" /></svg>
);
export const BookIcon = () => (
  <svg {...base}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></svg>
);
export const SearchIcon = () => (
  <svg {...base} width={16} height={16}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
