type IconProps = { className?: string };

/** Shared stroke defaults for the hand-drawn cafe icon set. */
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconMug({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 5c.5-1 .5-1.5 0-2.5M12 5c.5-1 .5-1.5 0-2.5" />
    </svg>
  );
}

export function IconCompass({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 9.5 13 13l-3.5 1.5L11 11l3.5-1.5Z" />
    </svg>
  );
}

export function IconHeart({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 19s-7-4.35-9-8.5C1.6 7.1 3.4 4.5 6.3 4.5c1.9 0 3.2 1 4.7 2.7 1.5-1.7 2.8-2.7 4.7-2.7 2.9 0 4.7 2.6 3.3 6C19 14.65 12 19 12 19Z" />
    </svg>
  );
}

export function IconChip({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 6V3.5M15 6V3.5M9 20.5V18M15 20.5V18M6 9H3.5M6 15H3.5M20.5 9H18M20.5 15H18" />
    </svg>
  );
}

export function IconLeaf({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M5 19c8-1 12-6 13.5-13.5C10 6.5 5.5 10.5 5 19Z" />
      <path d="M6 18c3-4 6.5-7 12-10.5" />
    </svg>
  );
}

export function IconCroissant({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M3 15c1.5-6 5-10.5 9-11 4.5-.5 8 2 9 6-3-1.5-5 .5-4 3s-2 4-4 2c-1.5 2-4 3-5.5 1C5.5 17.5 4 17 3 15Z" />
    </svg>
  );
}

export function IconSandwich({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M3 12h18l-1.5 6.5a2 2 0 0 1-2 1.5H6.5a2 2 0 0 1-2-1.5L3 12Z" />
      <path d="M4 12c0-4.5 3.5-8 8-8s8 3.5 8 8" />
      <path d="M9 12v-2M12 12V9M15 12v-2" />
    </svg>
  );
}

export function IconBook({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 5.5c2-1 5-1 8 .5 3-1.5 6-1.5 8-.5v13c-2-1-5-1-8 .5-3-1.5-6-1.5-8-.5v-13Z" />
      <path d="M12 6v13" />
    </svg>
  );
}
