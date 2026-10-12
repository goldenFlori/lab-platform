import { Button, Dropdown, Label } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { CircleHelp, Copy, Languages, Settings, Sparkles } from 'lucide-react';
import { useT } from '../i18n';
import { aiStatusQuery } from '../lib/ai';
import { openLabTool } from '../lib/lab-tools';
import { useLive } from '../lib/live-context';

// The lab header's "AI" menu for staff (#98): every copilot tool from one visible place, saying
// what each needs (AI on in the course, a running Live Lab).

export function AiTools({ org, courseId }: { org: string; courseId: string }) {
  const t = useT();
  const live = useLive();
  const status = useQuery(aiStatusQuery(org, courseId));
  const on = status.data?.enabled === true;
  const hosting = live?.isHost === true;
  const disabled = [...(on ? [] : ['variant', 'translate']), ...(on && hosting ? [] : ['quiz'])];
  return (
    <Dropdown>
      <Button variant="tertiary" aria-label={t.aiTools.menu}>
        <Sparkles className="size-4" /> {t.aiTools.button}
      </Button>
      <Dropdown.Popover placement="bottom start" className="w-80">
        {!on && <p className="px-3 pt-3 text-xs text-muted">{t.aiTools.off}</p>}
        <Dropdown.Menu
          aria-label={t.aiTools.menu}
          disabledKeys={disabled}
          onAction={(key) => {
            if (key === 'settings') location.assign(`/o/${org}/courses/${courseId}`);
            else openLabTool(key as 'variant' | 'translate' | 'quiz');
          }}
        >
          <Dropdown.Item id="variant" textValue={t.aiTools.variant}>
            <Copy className="size-4" />
            <div className="grid">
              <Label>{t.aiTools.variant}</Label>
              <span className="text-xs text-muted">{t.aiTools.variantHelp}</span>
            </div>
          </Dropdown.Item>
          <Dropdown.Item id="translate" textValue={t.aiTools.translate}>
            <Languages className="size-4" />
            <div className="grid">
              <Label>{t.aiTools.translate}</Label>
              <span className="text-xs text-muted">{t.aiTools.translateHelp}</span>
            </div>
          </Dropdown.Item>
          <Dropdown.Item id="quiz" textValue={t.aiTools.quiz}>
            <CircleHelp className="size-4" />
            <div className="grid">
              <Label>{t.aiTools.quiz}</Label>
              <span className="text-xs text-muted">{hosting ? t.aiTools.quizHelp : t.aiTools.quizNeedsLive}</span>
            </div>
          </Dropdown.Item>
          <Dropdown.Item id="settings" textValue={t.aiTools.settings}>
            <Settings className="size-4" />
            <Label>{t.aiTools.settings}</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
