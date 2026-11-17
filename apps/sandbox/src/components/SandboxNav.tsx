import type { Theme } from '../theme';
import { ModeSwitch } from './ModeSwitch';
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
  spellcheck?: boolean;
  onSpellcheckChange?(enabled: boolean): void;
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
  spellcheck,
  onSpellcheckChange,
}: SandboxNavProps) {
  return (
    <nav className="sandbox-nav" data-testid="sandbox-nav">
      <ModeSwitch readOnly={readOnly} onChange={onReadOnlyChange} />
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
        spellcheck={spellcheck}
        onSpellcheckChange={onSpellcheckChange}
      />
    </nav>
  );
}
