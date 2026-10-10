import type { Data, Layout } from 'plotly.js-dist-min';
import plotlyUrl from 'plotly.js-dist-min/plotly.min.js?url';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../lib/theme';

// A Plotly figure that the notebook produced, drawn again so it stays interactive. plotly.js is
// about 4.8 MB, so it loads only when a figure comes near the screen, and once per visit.

type Plotly = typeof import('plotly.js-dist-min');
type Figure = { data?: Data[]; layout?: Partial<Layout> };

let plotly: Promise<Plotly> | null = null;

function loadPlotly(): Promise<Plotly> {
  plotly ??= new Promise<Plotly>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = plotlyUrl;
    script.async = true;
    script.onload = () => resolve((window as unknown as { Plotly: Plotly }).Plotly);
    script.onerror = () => {
      plotly = null; // Try again next time.
      reject(new Error('plotly.js did not load'));
    };
    document.head.appendChild(script);
  });
  return plotly;
}

/** Colours that follow the app's theme; the notebook's own choices are kept. */
function themed(layout: Partial<Layout>, dark: boolean): Partial<Layout> {
  const grid = dark ? 'rgba(255,255,255,0.09)' : 'rgba(30,30,60,0.09)';
  const out: Record<string, unknown> = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter Variable, ui-sans-serif, system-ui', ...layout.font, color: dark ? '#cfcfe0' : '#3a3a4c' },
  };
  const axes = Object.keys(layout).filter((key) => /^[xy]axis\d*$/.test(key));
  for (const key of axes.length ? axes : ['xaxis', 'yaxis']) {
    const axis = (layout as Record<string, object | undefined>)[key];
    out[key] = { ...axis, gridcolor: grid, zerolinecolor: grid, linecolor: grid };
  }
  return out as Partial<Layout>;
}

export function PlotlyFigure({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const drawn = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'waiting' | 'loading' | 'ready' | 'failed'>('waiting');
  const [figure, setFigure] = useState<Figure | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const element = ref.current;
    if (!element || state !== 'waiting') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setState('loading');
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [state]);

  useEffect(() => {
    if (state !== 'loading') return;
    let cancelled = false;
    Promise.all([
      loadPlotly(),
      fetch(src, { credentials: 'same-origin' }).then((res) => {
        if (!res.ok) throw new Error(`figure: ${res.status}`);
        return res.json() as Promise<Figure>;
      }),
    ]).then(
      ([, spec]) => {
        if (cancelled) return;
        setFigure(spec);
        setState('ready');
      },
      () => !cancelled && setState('failed'),
    );
    return () => {
      cancelled = true;
    };
  }, [state, src]);

  // Drawn once the figure is here, and again in the other theme's colours.
  useEffect(() => {
    const host = plotRef.current;
    if (!host || !figure) return;
    let cancelled = false;
    void loadPlotly().then((Plotly) => {
      if (cancelled) return;
      const layout = figure.layout ?? {};
      void Plotly.react(
        host,
        figure.data ?? [],
        {
          ...layout,
          autosize: true,
          margin: { l: 55, r: 25, t: 45, b: 50, ...layout.margin },
          ...themed(layout, theme === 'dark'),
        },
        // No image export: it needs bundles that are not shipped.
        { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['toImage'] },
      );
      drawn.current = host;
    });
    return () => {
      cancelled = true;
    };
  }, [figure, theme]);

  // Plotly keeps listeners on the element; free them when it goes.
  useEffect(
    () => () => {
      const host = drawn.current;
      if (host && plotly) void plotly.then((Plotly) => Plotly.purge(host));
    },
    [],
  );

  return (
    <div ref={ref} className="plotly-figure">
      {state === 'ready' ? (
        <div ref={plotRef} className="pf-plot" />
      ) : (
        <p
          className={state === 'failed' ? 'pf-status pf-error' : 'pf-status'}
          role={state === 'failed' ? 'alert' : undefined}
        >
          {state === 'failed'
            ? 'Grafiku nuk u ngarkua. Rifreskoni faqen ose shkarkoni fletoren për ta parë.'
            : state === 'loading'
              ? 'Duke ngarkuar grafikun…'
              : 'Grafiku ngarkohet kur të shfaqet…'}
        </p>
      )}
    </div>
  );
}
