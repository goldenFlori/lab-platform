import { LazyMotion, MotionConfig, m, type Transition } from 'motion/react';
import type { ReactNode } from 'react';

// Motion (#128): the app's springs in one place, so movement feels the same everywhere. Its
// animation code loads after the page (LazyMotion), and nothing moves for those who ask their
// system for reduced motion.

const features = () => import('./motion-features').then((module) => module.default);

export const SPRING = {
  /** Steps of a visualization, toggles, cards: quick, with a touch of bounce. */
  snappy: { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 },
  /** Page content and panels: calm. */
  gentle: { type: 'spring', stiffness: 220, damping: 28 },
} satisfies Record<string, Transition>;

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** A page's content rises into place when the page changes. */
export function PageEnter({ id, children }: { id: string; children: ReactNode }) {
  return (
    <m.div key={id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING.gentle}>
      {children}
    </m.div>
  );
}
