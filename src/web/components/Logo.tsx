/**
 * A moment of BFS on deep ink (#128): the current vertex (blue, with its ring), one already
 * visited (teal), one on the frontier (amber), and the path between them (magenta). The same
 * drawing as public/favicon.svg, from which the install icons are made.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#141b31" />
      <path d="M11.5 27.5 L20 12" stroke="#e5489f" strokeWidth="3" strokeLinecap="round" />
      <path d="M20 12 L29 25.5" stroke="#5b6b94" strokeWidth="2" strokeLinecap="round" />
      <path d="M11.5 27.5 L29 25.5" stroke="#5b6b94" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <circle cx="11.5" cy="27.5" r="3.6" fill="#3cc6c6" />
      <circle cx="29" cy="25.5" r="3.6" fill="#f5b13d" />
      <circle cx="20" cy="12" r="5.6" fill="none" stroke="#5f8bff" strokeWidth="1.4" opacity="0.55" />
      <circle cx="20" cy="12" r="3.8" fill="#5f8bff" />
    </svg>
  );
}
