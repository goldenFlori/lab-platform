import { useId } from 'react';

/** A small graph on the brand gradient: three vertices, one highlighted path. */
export function Logo({ className }: { className?: string }) {
  const gradient = useId();
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand)" />
          <stop offset="1" stopColor="var(--brand-2)" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gradient})`} />
      <path
        d="M11 27 L20 12 L29 25"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      <path d="M11 27 L29 25" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <circle cx="11" cy="27" r="3.6" fill="white" />
      <circle cx="20" cy="12" r="3.6" fill="white" />
      <circle cx="29" cy="25" r="3.6" fill="white" />
    </svg>
  );
}
