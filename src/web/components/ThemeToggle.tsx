import { Button } from '@heroui/react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      aria-label={dark ? 'Kalo në temën e çelët' : 'Kalo në temën e errët'}
      onPress={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </Button>
  );
}
