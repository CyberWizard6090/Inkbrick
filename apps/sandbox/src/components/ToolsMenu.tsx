import { useSandboxI18n, type SandboxKey } from '../i18n';
import { Dropdown } from './Dropdown';

interface ToolsMenuProps {
  onLoadSample(): void;
  onLoadLarge(): void;
  onAddUnknown(): void;
  debug: boolean;
  onToggleDebug(): void;
  onShowShortcuts(): void;
  onExportJson(): void;
  onImportJson(): void;
  onResetData(): void;
}

export function ToolsMenu({
  onLoadSample,
  onLoadLarge,
  onAddUnknown,
  debug,
  onToggleDebug,
  onShowShortcuts,
  onExportJson,
  onImportJson,
  onResetData,
}: ToolsMenuProps) {
  const { t } = useSandboxI18n();

  return (
    <Dropdown testId="tools-menu" label={t('nav.tools')}>
      {(close) => {
        const item = (id: string, label: SandboxKey, hint: SandboxKey, action: () => void) => (
          <button
            type="button"
            role="menuitem"
            data-testid={id}
            onClick={() => {
              close();
              action();
            }}
          >
            <span>{t(label)}</span>
            <small>{t(hint)}</small>
          </button>
        );

        return (
          <>
            {item('load-sample', 'tools.sample', 'tools.sampleHint', onLoadSample)}
            {item('load-large', 'tools.large', 'tools.largeHint', onLoadLarge)}
            {item('add-unknown', 'tools.unknown', 'tools.unknownHint', onAddUnknown)}
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={debug}
              className={debug ? 'is-active' : ''}
              data-testid="toggle-debug"
              onClick={() => {
                close();
                onToggleDebug();
              }}
            >
              <span>{t('tools.debug')}</span>
              <small>{t('tools.debugHint')}</small>
            </button>
            {item('show-shortcuts', 'tools.shortcuts', 'tools.shortcutsHint', onShowShortcuts)}
            <hr />
            {item('export-json', 'tools.export', 'tools.exportHint', onExportJson)}
            {item('import-json', 'tools.import', 'tools.importHint', onImportJson)}
            {item('reset-data', 'tools.reset', 'tools.resetHint', onResetData)}
          </>
        );
      }}
    </Dropdown>
  );
}
