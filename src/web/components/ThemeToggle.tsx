import { Button } from '@heroui/react';
import { Moon, Sun } from 'lucide-react';
import { useT } from '../i18n';
import { useTheme } from '../lib/theme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const dark = theme === 'dark';
  const t = useT();
  return (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      aria-label={dark ? t.header.themeLight : t.header.themeDark}
      onPress={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </Button>
  );
}
