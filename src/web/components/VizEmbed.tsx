import { Button } from '@heroui/react';
import { RotateCcw } from 'lucide-react';
import { Component, type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import type { VisualizerId } from '../../shared/visualizers';
import { VIZ, type VizProps } from '../../viz';
import { t as messages, useT } from '../i18n';
import { reportError } from '../lib/report-error';

/** One visualization. Its code loads only when it comes near the screen. */
export function VizEmbed({ viz, props, label }: { viz: VisualizerId; props?: VizProps | null; label?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  const Viz = VIZ[viz].Component;
  return (
    <div ref={ref} className="viz-embed" data-viz-id={viz}>
      {label && (
        <p className="mb-3 flex items-center gap-2 text-[0.72rem] font-semibold tracking-wider text-accent uppercase">
          <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
          {label}
        </p>
      )}
      {near ? (
        <VizErrorBoundary key={viz}>
          <Suspense fallback={<VizPlaceholder />}>
            <Viz {...props} />
          </Suspense>
        </VizErrorBoundary>
      ) : (
        <VizPlaceholder />
      )}
    </div>
  );
}

export function VizPlaceholder() {
  const t = useT();
  return (
    <div className="grid min-h-96 place-items-center rounded-3xl border border-border bg-surface" aria-busy="true">
      <span className="text-sm text-muted">{t.notebook.vizLoading}</span>
    </div>
  );
}

/** A visualization that fails (most often: its code changed with a new release) does not take the page down. */
export class VizErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  // The owner hears of it (#179); a chunk gone after a release is the usual cause, and says so.
  componentDidCatch(error: unknown) {
    if (import.meta.env.PROD) reportError('render', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const t = messages();
    return (
      <div
        role="alert"
        className="grid min-h-48 place-items-center gap-3 rounded-3xl border border-dashed border-border px-6 py-10 text-center"
      >
        <div>
          <p className="font-medium">{t.notebook.vizFailed}</p>
          <p className="mt-1 text-sm text-muted">{t.notebook.vizFailedHelp}</p>
        </div>
        <Button size="sm" variant="secondary" onPress={() => window.location.reload()}>
          <RotateCcw className="size-4" /> {t.notebook.reload}
        </Button>
      </div>
    );
  }
}
