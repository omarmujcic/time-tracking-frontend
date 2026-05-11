export type ThemePreference = 'SYSTEM' | 'LIGHT' | 'DARK';

export function applyThemePreference(themeMode: ThemePreference): void {
  const resolvedTheme = themeMode === 'SYSTEM'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : themeMode.toLowerCase();

  document.documentElement.dataset['theme'] = resolvedTheme;
}
