import { useEffect } from 'react';
import { useThemeStore } from '@/stores';

export function ThemeApplier() {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      let dark = false;
      if (theme === 'dark') dark = true;
      else if (theme === 'light') dark = false;
      else dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', dark);
    };
    apply();
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);
  return null;
}
