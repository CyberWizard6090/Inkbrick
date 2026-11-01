import { localeName } from '../locales';
import { useSandboxI18n, type SandboxKey } from '../i18n';
import { THEMES, type Theme } from '../theme';
import { Dropdown } from './Dropdown';

const THEME_LABELS: Record<Theme, { icon: string; label: SandboxKey; title: SandboxKey }> = {
  auto: { icon: '◐', label: 'theme.auto', title: 'theme.autoTitle' },
  light: { icon: '☀', label: 'theme.light', title: 'theme.lightTitle' },
  dark: { icon: '☾', label: 'theme.dark', title: 'theme.darkTitle' },
};

interface SettingsMenuProps {
  theme: Theme;
  onThemeChange(theme: Theme): void;
  locale: string;
  locales: readonly string[];
  onLocaleChange(locale: string): void;
}

export function SettingsMenu({
  theme,
  onThemeChange,
  locale,
  locales,
  onLocaleChange,
}: SettingsMenuProps) {
  const { t } = useSandboxI18n();

  return (
    <Dropdown
      testId="settings-menu"
      label={t('nav.settings')}
      role="group"
      className="settings-menu"
      width={296}
    >
      {(close) => (
        <>
          <section>
            <h4>{t('settings.theme')}</h4>
            <div className="settings-menu__row" role="group" data-testid="theme-switch">
              {THEMES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={theme === id ? 'is-active' : ''}
                  data-theme={id}
                  title={t(THEME_LABELS[id].title)}
                  aria-pressed={theme === id}
                  onClick={() => {
                    close();
                    onThemeChange(id);
                  }}
                >
                  <span aria-hidden="true">{THEME_LABELS[id].icon}</span>{' '}
                  {t(THEME_LABELS[id].label)}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4>{t('settings.language')}</h4>
            <div className="settings-menu__row" role="group" data-testid="locale-switch">
              {locales.map((code) => (
                <button
                  key={code}
                  type="button"
                  className={locale === code ? 'is-active' : ''}
                  data-locale={code}
                  title={localeName(code)}
                  aria-pressed={locale === code}
                  onClick={() => {
                    close();
                    onLocaleChange(code);
                  }}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </Dropdown>
  );
}
