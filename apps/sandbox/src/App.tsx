import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DocumentView,
  EditorProvider,
  htmlToFragment,
  virtualRenderer,
  type ImageOptions,
} from '@inkbrick/react';
import { type DocumentSnapshot, type TextAttributes } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';
import { InsertChildChange, SetBlockChange } from '@inkbrick/store';

import { DebugPanel } from './components/DebugPanel';
import { HistoryButtons } from './components/HistoryButtons';
import { createSandboxI18n, describe, SandboxI18nContext } from './i18n';
import { loadLargeDocument } from './largeDocument';
import { SandboxNav } from './components/SandboxNav';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { availableLocales, initialLocale, persistLocale } from './locales';
import { applyTheme, initialTheme, type Theme } from './theme';
import { COUNTER, counterEvents } from './blocks/counter';
import {
  clearSandboxStorage,
  downloadDocument,
  saveDocument,
  type RestoredEditor,
  startAutosave,
} from './persistence';
import {
  createSandboxEditor,
  createSandboxSchema,
  customBlocks,
  parseDocument,
} from './sandboxEditor';

/** Загрузчик картинок для демо: имя «slow…» — долгая загрузка, «fail…» — ошибка; результат — data:-адрес. */
const imageErrors: string[] = [];
const demoImages: ImageOptions = {
  upload: async (file) => {
    if (file.size > 1_500_000) throw new Error('Image is larger than 1.5 MB');
    if (file.name.startsWith('fail')) throw new Error('Upload failed');
    if (file.name.startsWith('slow')) await new Promise((resolve) => setTimeout(resolve, 700));

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  },
  onError: (error) => {
    imageErrors.push(error instanceof Error ? error.message : String(error));
    (window as unknown as { __imageErrors: string[] }).__imageErrors = imageErrors;
  },
};

const firstNote = (editor: Editor) => editor.document.getBlock(editor.document.rootId)!.children[0];

function sampleImage(): string {
  const canvas = document.createElement('canvas');

  canvas.width = 320;
  canvas.height = 120;

  const context = canvas.getContext('2d');

  if (!context) return '';

  const gradient = context.createLinearGradient(0, 0, 320, 120);

  gradient.addColorStop(0, '#4aa3ff');
  gradient.addColorStop(0.5, '#b57dff');
  gradient.addColorStop(1, '#ff6bd1');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 320, 120);

  return canvas.toDataURL('image/png');
}

type SampleText = string | { text: string; attributes: TextAttributes } | { latex: string };

/**
 * Наполняет документ примером со всеми типами блоков (заголовки, списки с вложенностью, цитата, код, заметки,
 * разделитель, картинка, формула) и со всеми видами форматирования текста. Пустой первый абзац используется как есть.
 * Первые блоки (абзац, заголовок, задача, код) и последний абзац нужны e2e-тестам режима чтения.
 */
function loadSample(editor: Editor): void {
  const note = firstNote(editor);
  const children = editor.document.getBlock(note)!.children;
  const only = children.length === 1 ? editor.document.getBlock(children[0])! : null;
  const reuseFirst = only && only.flavour === 'block:paragraph' && only.content.length === 0;
  let after = children[children.length - 1];

  const point = (blockId: string, offset: number) => ({ blockId, offset });

  /**
   * Записывает в пустой блок куски текста: обычные, с форматированием и встроенные формулы. Сначала весь текст
   * без форматирования (иначе каждый следующий кусок унаследовал бы формат предыдущего, как при наборе),
   * потом форматирование по диапазонам, в конце формулы — справа налево, чтобы не сдвигать позиции.
   */
  const write = (blockId: string, pieces: readonly SampleText[]) => {
    const ranges: Array<{ from: number; to: number; attributes: TextAttributes }> = [];
    const formulas: Array<{ at: number; latex: string }> = [];
    let text = '';

    for (const piece of pieces) {
      if (typeof piece === 'string') {
        text += piece;
      } else if ('latex' in piece) {
        formulas.push({ at: text.length, latex: piece.latex });
      } else {
        ranges.push({
          from: text.length,
          to: text.length + piece.text.length,
          attributes: piece.attributes,
        });
        text += piece.text;
      }
    }

    editor.dispatch({ type: 'replaceText', payload: { blockId, from: 0, to: 0, text } });

    for (const { from, to, attributes } of ranges)
      editor.dispatch({
        type: 'setInlineAttributes',
        payload: { from: point(blockId, from), to: point(blockId, to), attributes },
      });

    for (const { at, latex } of formulas.reverse())
      editor.dispatch({ type: 'insertFormula', payload: { blockId, from: at, to: at, latex } });
  };

  const add = (
    flavour: string,
    props?: Record<string, unknown>,
    pieces: readonly SampleText[] = [],
    parentId?: string,
  ): string => {
    const caret = editor.dispatch({
      type: 'insertBlock',
      payload: parentId ? { flavour, parentId, props } : { flavour, afterId: after, props },
    }) as { blockId: string };

    write(caret.blockId, pieces);
    if (!parentId) after = caret.blockId;

    return caret.blockId;
  };

  if (reuseFirst) write(only.id, ['First paragraph']);
  else add('block:paragraph', undefined, ['First paragraph']);

  add('block:heading', { level: 2 }, ['A heading']);
  add('block:list', { type: 'todo', checked: false }, ['A task']);
  add('block:code', { language: 'python' }, ['print(1)']);

  add('block:heading', { level: 1 }, ['Heading 1']);
  add('block:heading', { level: 3 }, ['Heading 3']);
  add('block:heading', { level: 4 }, ['Heading 4']);
  add('block:heading', { level: 5 }, ['Heading 5']);
  add('block:heading', { level: 6 }, ['Heading 6']);

  const bullet = add('block:list', { type: 'bullet' }, ['Bullet item']);

  add('block:list', { type: 'bullet' }, ['Nested item'], bullet);
  add('block:list', { type: 'bullet' }, ['Another bullet']);
  add('block:list', { type: 'ordered' }, ['First step']);
  add('block:list', { type: 'ordered' }, ['Second step']);

  add('block:quote', undefined, ['A quote: the best way to predict the future is to invent it.']);
  add('block:callout', { tone: 'info' }, ['Info callout']);
  add('block:callout', { tone: 'warning' }, ['Warning callout']);
  add('block:divider');

  add('block:image', {
    src: sampleImage(),
    alt: 'Gradient',
    caption: 'An image with a caption',
    width: 60,
  });
  add('block:formula', { latex: '\\int_0^1 x^2\\,dx = \\tfrac{1}{3}' });

  add(COUNTER, { count: 3 }, ['Custom block: counter']);

  add('block:paragraph', undefined, [
    { text: 'Bold', attributes: { bold: true } },
    ' ',
    { text: 'italic', attributes: { italic: true } },
    ' ',
    { text: 'underline', attributes: { underline: true } },
    ' ',
    { text: 'strike', attributes: { strike: true } },
    ' ',
    { text: 'code', attributes: { code: true } },
    ' ',
    { text: 'link', attributes: { link: 'https://example.com' } },
    ' ',
    { text: 'red text', attributes: { color: 'red' } },
    ' ',
    { text: 'highlight', attributes: { backgroundColor: 'yellow' } },
    ' and a formula ',
    { latex: 'E = mc^2' },
    '.',
  ]);

  const centered = add('block:paragraph', undefined, ['Centered text']);

  editor.dispatch({
    type: 'setAlign',
    payload: { from: point(centered, 0), to: point(centered, 0), align: 'center' },
  });

  add('block:paragraph', undefined, ['Last paragraph']);

  editor.clearHistory();
}

function addUnknownBlock(editor: Editor): void {
  const note = firstNote(editor);
  const taken = new Set(Object.keys(editor.document.dump()));
  let n = 1;

  while (taken.has(`mystery-${n}`)) n += 1;

  editor.store.transact((tx) => {
    const index = tx.getBlock(note)!.children.length;

    // Схема такого блока не знает, поэтому проверку вложенности движка обходим и пишем изменения напрямую.
    tx.apply(
      new SetBlockChange({
        id: `mystery-${n}`,
        flavour: 'block:mystery',
        parentId: note,
        children: [],
        content: [{ insert: 'secret payload' }],
        props: { secret: 42 },
      }),
    );
    tx.apply(new InsertChildChange(note, index, `mystery-${n}`));
  });
}

declare global {
  interface Window {
    __inkbrick?: Record<string, { editor: Editor; snapshot: () => DocumentSnapshot }>;
    __inkbrickClipboard?: { htmlToFragment: typeof htmlToFragment };
    __counterEvents?: () => readonly string[];
  }
}

window.__inkbrickClipboard = { htmlToFragment };

/**
 * Песочница рисует документ виртуально: длинные списки блоков (от 100) — только около видимой области,
 * короткие — как обычно. Так «Большой документ» (50 000 блоков) открывается и редактируется без задержек.
 */
const renderer = virtualRenderer();

window.__counterEvents = counterEvents;

export const publish = (editor: Editor) => {
  (window.__inkbrick ??= {}).main = {
    editor,
    snapshot: () => editor.serialize(),
  };
};

/** `value` — сообщение или ошибка: переводятся при показе, поэтому смена языка меняет и видимое уведомление. */
interface Notice {
  value: unknown;
  error?: boolean;
}

const NOTICE_MS = 6000;

export function App({ initial }: { initial: RestoredEditor }) {
  const [editor, setEditor] = useState(initial.editor);
  const [session, setSession] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(
    initial.notice ? { value: initial.notice } : null,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [debug, setDebug] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [locale, setLocale] = useState(initialLocale);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const i18n = useMemo(() => createSandboxI18n(locale), [locale]);
  const { t } = i18n;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    publish(editor);

    return startAutosave(editor);
  }, [editor]);

  useEffect(() => {
    if (!notice) return;

    const timer = setTimeout(() => setNotice(null), NOTICE_MS);

    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault();
        setShortcuts((open) => !open);
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const changeLocale = (next: string) => {
    persistLocale(next);
    setLocale(next);
  };

  const importFile = async (file: File) => {
    try {
      const schema = createSandboxSchema();
      const { document, fixes } = parseDocument(await file.text(), schema);
      const next = createSandboxEditor(schema, document);

      void saveDocument(next);
      setEditor(next);
      setSession((value) => value + 1);
      setNotice({
        value:
          fixes.length > 0
            ? { key: 'notice.importedFixed', params: { name: file.name, count: fixes.length } }
            : { key: 'notice.imported', params: { name: file.name } },
      });
    } catch (error) {
      setNotice({ value: error, error: true });
    }
  };

  const resetData = async () => {
    if (!window.confirm(t('reset.confirm'))) return;

    await clearSandboxStorage();
    window.location.assign(window.location.pathname);
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
      <EditorProvider
        key={session}
        editor={editor}
        blocks={customBlocks}
        locale={locale}
        readOnly={readOnly}
        images={demoImages}
      >
        <SandboxNav
          readOnly={readOnly}
          onReadOnlyChange={setReadOnly}
          debug={debug}
          onToggleDebug={() => setDebug((value) => !value)}
          onLoadSample={() => loadSample(editor)}
          onLoadLarge={() => loadLargeDocument(editor)}
          onAddUnknown={() => addUnknownBlock(editor)}
          onShowShortcuts={() => setShortcuts(true)}
          onExportJson={() => downloadDocument(editor)}
          onImportJson={() => fileInput.current?.click()}
          onResetData={() => void resetData()}
          theme={theme}
          onThemeChange={setTheme}
          locale={locale}
          locales={availableLocales()}
          onLocaleChange={changeLocale}
        />
        <div className="playground-root">
          <div className="playground-editor">
            <header className="playground-header">{t('app.title')}</header>
            <HistoryButtons />
            <div className="playground-content">
              <DocumentView renderer={renderer} />
            </div>
            {debug && <DebugPanel />}
          </div>
        </div>
        {shortcuts && <ShortcutsHelp onClose={() => setShortcuts(false)} />}
      </EditorProvider>
      {notice && (
        <div
          className={notice.error ? 'sandbox-notice sandbox-notice--error' : 'sandbox-notice'}
          role={notice.error ? 'alert' : 'status'}
          data-testid="notice"
        >
          <span>{describe(t, notice.value)}</span>
          <button type="button" aria-label={t('notice.close')} onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
    </SandboxI18nContext.Provider>
  );
}
