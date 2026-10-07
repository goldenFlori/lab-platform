import { createFileRoute } from '@tanstack/react-router';
import { FlaskConical } from 'lucide-react';
import { APP_NAME } from '../lib/brand';

export const Route = createFileRoute('/labs')({
  head: () => ({ meta: [{ title: `Laboratorët · ${APP_NAME}` }] }),
  component: LabsPage,
});

// The list arrives with lab visibility (#12) and the lab viewer (#14).
function LabsPage() {
  return (
    <section className="container-page py-12">
      <h1 className="text-3xl font-bold tracking-tight">Laboratorët</h1>
      <div className="mt-8 grid place-items-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
        <FlaskConical className="size-8 text-muted" aria-hidden="true" />
        <p className="mt-4 font-medium">Ende asnjë laborator i hapur</p>
        <p className="mt-1 text-sm text-muted">Laboratorët shfaqen këtu sapo pedagogu t'i hapë.</p>
      </div>
    </section>
  );
}
