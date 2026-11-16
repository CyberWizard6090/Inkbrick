import { useSandboxI18n, type SandboxKey } from '../i18n';
import { Dropdown } from './Dropdown';

interface TableToolsMenuProps {
  onSample(): void;
  onRandom(): void;
  onLarge(): void;
  onAddRows(): void;
  onClear(): void;
  debug: boolean;
  onToggleDebug(): void;
  onExport(): void;
  onImport(): void;
  onReset(): void;
}

/** Инструменты песочницы табличного редактора: данные, Debug-панель, обмен файлами. */
export function TableToolsMenu({
  onSample,
  onRandom,
  onLarge,
  onAddRows,
  onClear,
  debug,
  onToggleDebug,
  onExport,
  onImport,
  onReset,
}: TableToolsMenuProps) {
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
            {item('table-sample', 'table.tools.sample', 'table.tools.sampleHint', onSample)}
            {item('table-random', 'table.tools.random', 'table.tools.randomHint', onRandom)}
            {item('table-large', 'table.tools.large', 'table.tools.largeHint', onLarge)}
            {item('table-add-rows', 'table.tools.addRows', 'table.tools.addRowsHint', onAddRows)}
            {item('table-clear', 'table.tools.clear', 'table.tools.clearHint', onClear)}
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
            <hr />
            {item('export-json', 'table.tools.export', 'table.tools.exportHint', onExport)}
            {item('import-json', 'table.tools.import', 'table.tools.importHint', onImport)}
            {item('reset-data', 'table.tools.reset', 'table.tools.resetHint', onReset)}
          </>
        );
      }}
    </Dropdown>
  );
}
