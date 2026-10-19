import { Button } from '@heroui/react';
import { Database, Download, Square } from 'lucide-react';
import { useRef, useState } from 'react';
import type { OrganizationExport as Organization } from '../../shared/org-export';
import { useT } from '../i18n';
import { downloadExport, type ExportProgress, exportOrganization } from '../lib/org-export';

// The institution's data in one file (#117), for its admins on their courses page: people, courses,
// labs, notebooks, submissions, grades and activity, gathered page by page in this browser.

export function OrganizationExport({ organization }: { organization: Organization['organization'] }) {
  const t = useT();
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [failed, setFailed] = useState(false);
  const abort = useRef<AbortController | null>(null);

  async function start() {
    setFailed(false);
    abort.current = new AbortController();
    try {
      downloadExport(await exportOrganization(organization, setProgress, abort.current.signal));
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setFailed(true);
    } finally {
      setProgress(null);
    }
  }

  return (
    <section
      aria-label={t.orgExport.title}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
      data-testid="org-export"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Database className="size-4 text-accent" aria-hidden="true" /> {t.orgExport.title}
        </p>
        <p className="mt-0.5 text-xs text-muted" aria-live="polite">
          {progress ? t.orgExport.progress(progress.step + 1, progress.of) : t.orgExport.help}
        </p>
        {failed && <p className="mt-1 text-sm text-danger">{t.orgExport.failed}</p>}
      </div>
      {progress ? (
        <Button size="sm" variant="secondary" onPress={() => abort.current?.abort()}>
          <Square className="size-4" /> {t.orgExport.stop}
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onPress={start}>
          <Download className="size-4" /> {t.orgExport.download}
        </Button>
      )}
    </section>
  );
}
