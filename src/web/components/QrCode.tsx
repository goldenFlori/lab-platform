import { generate } from 'lean-qr';
import { toSvgPath } from 'lean-qr/extras/svg';
import { useMemo } from 'react';

/**
 * A QR code as SVG. Always dark on white with a quiet zone around it, whatever the theme:
 * phone cameras read that most reliably, also from a projector.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const code = useMemo(() => generate(value), [value]);
  const pad = 4;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${code.size + pad * 2} ${code.size + pad * 2}`}
      className={className}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect x={-pad} y={-pad} width={code.size + pad * 2} height={code.size + pad * 2} fill="#fff" />
      <path d={toSvgPath(code)} fill="#000" />
    </svg>
  );
}
