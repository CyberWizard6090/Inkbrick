import { useSandboxI18n } from '../i18n';
import type { Theme } from '../theme';
import { SettingsMenu } from './SettingsMenu';
import { ToolsMenu } from './ToolsMenu';

interface SandboxNavProps {
  readOnly: boolean;
  onReadOnlyChange(readOnly: boolean): void;
  debug: boolean;
  onToggleDebug(): void;
  onLoadSample(): void;
  onLoadLarge(): void;
  onAddUnknown(): void;
  onShowShortcuts(): void;
  onExportJson(): void;
  onImportJson(): void;
  onResetData(): void;
  theme: Theme;
  onThemeChange(theme: Theme): void;
  locale: string;
  locales: readonly string[];
  onLocaleChange(locale: string): void;
}

export function SandboxNav({
  readOnly,
  onReadOnlyChange,
  debug,
  onToggleDebug,
  onLoadSample,
  onLoadLarge,
  onAddUnknown,
  onShowShortcuts,
  onExportJson,
  onImportJson,
  onResetData,
  theme,
  onThemeChange,
  locale,
  locales,
  onLocaleChange,
}: SandboxNavProps) {
  const { t } = useSandboxI18n();

  return (
    <nav className="sandbox-nav" data-testid="sandbox-nav">
      <span
        className="sandbox-nav__group"
        role="group"
        aria-label={t('nav.mode')}
        data-testid="mode-switch"
      >
        <button
          type="button"
          className={readOnly ? '' : 'is-active'}
          data-testid="mode-edit"
          aria-pressed={!readOnly}
          onClick={() => onReadOnlyChange(false)}
        >
          {t('nav.edit')}
        </button>
        <button
          type="button"
          className={readOnly ? 'is-active' : ''}
          data-testid="mode-read"
          aria-pressed={readOnly}
          onClick={() => onReadOnlyChange(true)}
        >
          {t('nav.read')}
        </button>
      </span>
      <ToolsMenu
        onLoadSample={onLoadSample}
        onLoadLarge={onLoadLarge}
        onAddUnknown={onAddUnknown}
        debug={debug}
        onToggleDebug={onToggleDebug}
        onShowShortcuts={onShowShortcuts}
        onExportJson={onExportJson}
        onImportJson={onImportJson}
        onResetData={onResetData}
      />
      <SettingsMenu
        theme={theme}
        onThemeChange={onThemeChange}
        locale={locale}
        locales={locales}
        onLocaleChange={onLocaleChange}
      />
    </nav>
  );
}
