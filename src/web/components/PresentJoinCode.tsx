import { Button } from '@heroui/react';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { formatJoinCode } from '../../shared/join-code';
import { useT } from '../i18n';
import { QrCode } from './QrCode';

/** Full screen for the projector: the QR code, the code in large letters, and where to type it. */
export function PresentJoinCode({
  code,
  courseTitle,
  groupName,
  onClose,
}: {
  code: string;
  courseTitle: string;
  groupName: string;
  onClose: () => void;
}) {
  const joinUrl = `${window.location.origin}/join?code=${code}`;
  const t = useT();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.joinScreen.label(groupName)}
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-background p-6"
    >
      <Button
        isIconOnly
        variant="ghost"
        className="absolute top-4 right-4"
        aria-label={t.common.close}
        onPress={onClose}
      >
        <X className="size-5" />
      </Button>
      <div className="grid w-full max-w-5xl items-center gap-8 text-center md:grid-cols-[auto_1fr] md:text-left">
        <QrCode
          value={joinUrl}
          label={t.joinScreen.qr(groupName)}
          className="mx-auto w-full max-w-[min(70vh,24rem)] rounded-2xl"
        />
        <div>
          <p className="text-lg text-muted">
            {courseTitle} · {groupName}
          </p>
          <p className="mt-6 text-xl font-medium">{t.joinScreen.scan}</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-accent break-all">{window.location.host}/join</p>
          <p className="mt-6 text-xl font-medium">{t.joinScreen.thenType}</p>
          <p className="mt-2 font-mono text-6xl font-extrabold tracking-widest sm:text-8xl">{formatJoinCode(code)}</p>
        </div>
      </div>
    </div>
  );
}
