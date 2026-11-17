import { useEffect, useMemo, useRef, useState } from 'react';

import { TableEditor, useHistory, WordCount } from '@inkbrick/react';
import { toMarkdown } from '@inkbrick/document';
import {
  createTableEditor,
  tableIdOf,
  tableValue,
  type Editor,
  type TableValue,
} from '@inkbrick/engine';

import { DebugPanel } from './components/DebugPanel';
import { ModeSwitch } from './components/ModeSwitch';
import { NoticeBar, type Notice } from './components/NoticeBar';
import { SettingsMenu } from './components/SettingsMenu';
import { TableToolsMenu } from './components/TableToolsMenu';
import { DemoSwitch } from './DemoSwitch';
import { createSandboxI18n, SandboxError, SandboxI18nContext } from './i18n';
import { availableLocales, initialLocale, persistLocale } from './locales';
import {
  downloadJson,
  emptyTable,
  largeTable,
  parseTableJson,
  randomRows,
  randomTable,
  sampleTable,
  type Grid,
} from './tableData';
import { applyTheme, initialTheme, type Theme } from './theme';

const NOTICE_MS = 6000;

const newEditor = (rows: Grid, header?: boolean) => createTableEditor({ rows, header });

/** Добавляет заполненные строки внизу таблицы одним шагом отмены. */
function appendRows(editor: Editor, rows: Grid): void {
  const tableId = tableIdOf(editor);

  if (!tableId) return;

  editor.batch(() => {
    for (const row of rows) {
      const index = editor.document.getBlock(tableId)!.children.length;

      editor.dispatch({ type: 'insertTableRow', payload: { blockId: tableId, index } } as never);

      const rowId = editor.document.getBlock(tableId)!.children[index];

      editor.document.getBlock(rowId)!.children.forEach((cellId, column) => {
        if (row[column]) {
          editor.dispatch({
            type: 'replaceText',
            payload: { blockId: cellId, from: 0, to: 0, text: row[column] },
          });
        }
      });
    }
  });
}

function HistoryBar() {
  const { canUndo, canRedo, undo, redo } = useHistory();

  return (
    <div className="history-buttons">
      <button type="button" data-testid="undo" disabled={!canUndo} onClick={undo}>
        ↶
      </button>
      <button type="button" data-testid="redo" disabled={!canRedo} onClick={redo}>
        ↷
      </button>
    </div>
  );
}

/**
 * Отдельный редактор таблицы с теми же инструментами, что у обычного: режим правки и чтения, данные (пример, случайные,
 * большая таблица, добавление строк), Debug-панель, обмен JSON, тема и язык.
 */
export function TableDemo() {
  const [editor, setEditor] = useState(() => newEditor(sampleTable()));
  const [session, setSession] = useState(0);
  const [value, setValue] = useState<TableValue | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [debug, setDebug] = useState(false);
  const [locale, setLocale] = useState(initialLocale);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const i18n = useMemo(() => createSandboxI18n(locale), [locale]);
  const { t } = i18n;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!notice) return;

    const timer = setTimeout(() => setNotice(null), NOTICE_MS);

    return () => clearTimeout(timer);
  }, [notice]);

  const replace = (rows: Grid, header?: boolean) => {
    setEditor(newEditor(rows, header));
    setSession((count) => count + 1);
    setValue(null);
  };

  const importFile = async (file: File) => {
    try {
      const { rows, header } = parseTableJson(await file.text());

      replace(rows, header);
      setNotice({
        value: {
          key: 'notice.tableImported',
          params: { name: file.name, rows: rows.length, columns: rows[0].length },
        },
      });
    } catch (error) {
      setNotice({
        value: error instanceof SandboxError ? error : new SandboxError('notice.tableInvalid'),
        error: true,
      });
    }
  };

  const changeLocale = (next: string) => {
    persistLocale(next);
    setLocale(next);
  };

  return (
    <SandboxI18nContext.Provider value={i18n}>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="import-file"
        onChange={(event) => {
          const file = event.target.files?.[0];

          event.target.value = '';
          if (file) void importFile(file);
        }}
      />
      <DemoSwitch current="table" />
      <nav className="sandbox-nav" data-testid="sandbox-nav">
        <ModeSwitch readOnly={readOnly} onChange={setReadOnly} />
        <TableToolsMenu
          onSample={() => replace(sampleTable())}
          onRandom={() => replace(randomTable())}
          onLarge={() => replace(largeTable())}
          onAddRows={() => appendRows(editor, randomRows(10, Date.now() % 1000))}
          onClear={() => replace(emptyTable())}
          debug={debug}
          onToggleDebug={() => setDebug((open) => !open)}
          onExport={() => downloadJson('inkbrick-table', tableValue(editor))}
          onImport={() => fileInput.current?.click()}
          onReset={() => {
            replace(sampleTable());
            setReadOnly(false);
            setDebug(false);
          }}
        />
        <SettingsMenu
          theme={theme}
          onThemeChange={setTheme}
          locale={locale}
          locales={availableLocales()}
          onLocaleChange={changeLocale}
        />
      </nav>
      <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px' }}>
        <h1>{t('table.title')}</h1>
        <TableEditor
          key={session}
          editor={editor}
          locale={locale}
          readOnly={readOnly}
          onChange={setValue}
          label={t('table.label')}
        >
          <HistoryBar />
          <div className="playground-stats">
            <WordCount />
          </div>
          {debug && <DebugPanel />}
        </TableEditor>
        <h2>{t('table.value')}</h2>
        <pre data-testid="table-value">{JSON.stringify(value?.rows ?? null)}</pre>
        <h2>{t('table.markdown')}</h2>
        <pre data-testid="table-markdown">{value ? toMarkdown(editor.document) : ''}</pre>
      </main>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
    </SandboxI18nContext.Provider>
  );
}
