export type Theme = 'auto' | 'light' | 'dark';

export const THEMES: readonly Theme[] = ['auto', 'light', 'dark'];

const STORAGE_KEY = 'inkbrick-sandbox-theme';

export function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    return THEMES.includes(saved as Theme) ? (saved as Theme) : 'auto';
  } catch {
    return 'auto';
  }
}

/** Включает тему на <html>: `auto` убирает атрибут, и тема следует за системной настройкой. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  if (theme === 'auto') {
    root.removeAttribute('data-inkbrick-theme');
    root.style.colorScheme = '';
  } else {
    root.setAttribute('data-inkbrick-theme', theme);
    root.style.colorScheme = theme;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage недоступен (приватный режим): тема просто не запоминается
  }
}
