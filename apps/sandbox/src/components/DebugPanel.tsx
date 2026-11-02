import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEditor, useReadOnly } from '@inkbrick/react';
import {
  exportDocument,
  validateSnapshot,
  type BaseBlock,
  type Document,
  type ExportFormat,
} from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import { useSandboxI18n, type SandboxI18n, type SandboxKey } from '../i18n';

type Tab = 'tree' | 'json' | 'export' | 'log' | 'caret' | 'check';

const TABS: Array<{ id: Tab; label: SandboxKey }> = [
  { id: 'tree', label: 'debug.tab.tree' },
  { id: 'json', label: 'debug.tab.json' },
  { id: 'export', label: 'debug.tab.export' },
  { id: 'log', label: 'debug.tab.log' },
  { id: 'caret', label: 'debug.tab.caret' },
  { id: 'check', label: 'debug.tab.check' },
];

const REFRESH_MS = 250;

/**
 * С этого размера тяжёлые вкладки (экспорт, проверка) считаются по кнопке, а не на каждое изменение,
 * а JSON показывает только начало документа.
 */
const LARGE_DOCUMENT = 2000;

const PREVIEW_BLOCKS = 100;
const PREVIEW_CHARS = 100_000;

interface Snapshot {
  version: number;
  historyVersion: number;
  blockCount: number;
}

function usePanelSnapshot(editor: Editor): Snapshot {
  const read = (): Snapshot => ({
    version: editor.store.getVersion(),
    historyVersion: editor.store.getHistoryVersion(),
    blockCount: Object.keys(editor.document.dump()).length,
  });
  const [snapshot, setSnapshot] = useState(read);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = editor.store.subscribe(() => {
      timer ??= setTimeout(() => {
        timer = undefined;
        setSnapshot(read());
      }, REFRESH_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [editor]);

  return snapshot;
}

const truncate = (text: string, { t, number }: SandboxI18n) =>
  text.length > PREVIEW_CHARS
    ? `${text.slice(0, PREVIEW_CHARS)}\n${t('debug.truncated', { shown: number(PREVIEW_CHARS), total: number(text.length) })}`
    : text;

function CopyButton({ text, label }: { text: () => string; label: string }) {
  const { t } = useSandboxI18n();
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? t('debug.copied') : label}
    </button>
  );
}

interface LogEntry {
  n: number;
  time: string;
  type: string;
  payload: string;
  ms: number;
  version: number;
  error?: string;
}

const LOG_LIMIT = 200;
const PAYLOAD_CHARS = 2000;

const describePayload = (payload: unknown) => {
  try {
    const text = JSON.stringify(payload, null, 2) ?? 'undefined';

    return text.length > PAYLOAD_CHARS ? `${text.slice(0, PAYLOAD_CHARS)}\n…` : text;
  } catch {
    return String(payload);
  }
};

function useCommandLog(editor: Editor) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const { dispatcher, store } = editor;
    const original = dispatcher.execute.bind(dispatcher);

    dispatcher.execute = (type, payload) => {
      const started = performance.now();
      const push = (error?: string) => {
        const entry: LogEntry = {
          n: ++counter.current,
          time: new Date().toLocaleTimeString(),
          type,
          payload: describePayload(payload),
          ms: performance.now() - started,
          version: store.getVersion(),
          error,
        };

        setEntries((list) => [...list.slice(-(LOG_LIMIT - 1)), entry]);
      };

      try {
        const result = original(type, payload);
        push();
        return result;
      } catch (error) {
        push(error instanceof Error ? error.message : String(error));
        throw error;
      }
    };

    return () => {
      dispatcher.execute = original;
    };
  }, [editor]);

  return { entries, clear: () => setEntries([]) };
}

function validate(document: Document, editor: Editor, t: SandboxI18n['t']): string[] {
  const problems = validateSnapshot(editor.serialize(), editor.schema);
  const blocks = document.dump();
  const reachable = new Set<string>();
  // Обход итеративный: рекурсия на длинной цепочке вложенности переполнила бы стек.
  const stack: Array<{ id: string; trail: readonly string[] }> = [];

  if (blocks[document.rootId]) stack.push({ id: document.rootId, trail: [] });

  while (stack.length > 0) {
    const { id, trail } = stack.pop()!;

    if (reachable.has(id)) {
      problems.push(
        trail.includes(id)
          ? t('debug.cycle', { path: [...trail, id].join(' → ') })
          : t('debug.duplicate', { id }),
      );
      continue;
    }

    reachable.add(id);

    const path = [...trail, id];

    for (const childId of blocks[id]?.children ?? []) {
      if (blocks[childId]?.parentId === id) stack.push({ id: childId, trail: path });
    }
  }

  for (const block of Object.values(blocks)) {
    if (!reachable.has(block.id))
      problems.push(t('debug.unreachable', { id: block.id, flavour: block.flavour }));
    if (!editor.schema.hasBlock(block.flavour))
      problems.push(t('debug.noSchema', { id: block.id, flavour: block.flavour }));
    if (block.content.some((node) => node.insert === ''))
      problems.push(t('debug.emptyInline', { id: block.id }));
  }

  return problems;
}

/**
 * Результат тяжёлого расчёта. На небольшом документе он пересчитывается при каждом обновлении панели,
 * на большом — по кнопке, а устаревший результат помечается.
 */
function useOnDemand<T>(compute: () => T, snapshot: Snapshot, deps: readonly unknown[]) {
  const large = snapshot.blockCount >= LARGE_DOCUMENT;
  const [manual, setManual] = useState<{ value: T; version: number } | null>(null);
  const auto = useMemo(() => (large ? null : compute()), [large, snapshot.version, ...deps]);

  const run = () => setManual({ value: compute(), version: snapshot.version });

  if (!large) return { value: auto as T, large, stale: false, run };

  return {
    value: manual?.value ?? null,
    large,
    stale: manual !== null && manual.version !== snapshot.version,
    run,
  };
}

function OnDemandBar({
  blockCount,
  computed,
  stale,
  run,
  children,
}: {
  blockCount: number;
  computed: boolean;
  stale: boolean;
  run: () => void;
  children?: ReactNode;
}) {
  const { t, number } = useSandboxI18n();

  return (
    <div className="debug-row">
      <button type="button" onClick={run}>
        {computed ? t('debug.refresh') : t('debug.compute')}
      </button>
      {children}
      <span className="debug-id">
        {t('debug.onDemand', { count: number(blockCount) })}
        {stale ? ` · ${t('debug.stale')}` : ''}
      </span>
    </div>
  );
}

const textOf = (block: BaseBlock) => block.content.map((node) => node.insert).join('');

const clip = (text: string, limit: number) =>
  text.length > limit ? `${text.slice(0, limit)}…` : text;

interface Row {
  block: BaseBlock;
  depth: number;
}

function flatten(document: Document): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  const stack: Array<{ id: string; depth: number }> = [{ id: document.rootId, depth: 0 }];

  while (stack.length > 0) {
    const { id, depth } = stack.pop()!;
    const block = document.getBlock(id);

    if (!block || seen.has(id)) continue;

    seen.add(id);
    rows.push({ block, depth });

    for (let index = block.children.length - 1; index >= 0; index--) {
      stack.push({ id: block.children[index], depth: depth + 1 });
    }
  }

  return rows;
}

const ROW_HEIGHT = 20;
const OVERSCAN = 20;

const TreeRow = memo(function TreeRow({
  row,
  changed,
  top,
}: {
  row: Row;
  changed: boolean;
  top: number;
}) {
  const { block, depth } = row;
  const text = textOf(block);
  const props = Object.keys(block.props).length > 0 ? JSON.stringify(block.props) : '';

  return (
    <div
      className={changed ? 'debug-node debug-node--changed' : 'debug-node'}
      style={{ top, height: ROW_HEIGHT, paddingLeft: 4 + depth * 14 }}
    >
      <span className="debug-flavour">{block.flavour.replace('block:', '')}</span>
      <span className="debug-id">{block.id.slice(0, 8)}</span>
      {text && <span className="debug-text">«{clip(text, 40)}»</span>}
      {props && <span className="debug-props">{clip(props, 80)}</span>}
    </div>
  );
});

const TreeTab = memo(function TreeTab({
  document,
  version,
}: {
  document: Document;
  version: number;
}) {
  const { t } = useSandboxI18n();
  const previous = useRef<Map<string, BaseBlock> | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  // version — сигнал изменения: документ тот же объект, меняется его содержимое.
  const rows = useMemo(() => flatten(document), [document, version]);

  const changed = useMemo(() => {
    const before = previous.current;
    const ids = new Set<string>();

    if (before) {
      for (const { block } of rows) if (before.get(block.id) !== block) ids.add(block.id);
    }

    return ids;
  }, [rows]);

  useEffect(() => {
    previous.current = new Map(rows.map(({ block }) => [block.id, block]));
  }, [rows]);

  useEffect(() => {
    const element = viewport.current;

    if (!element) return;

    setHeight(element.clientHeight || 600);

    const observer = new ResizeObserver(() => setHeight(element.clientHeight || 600));

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  if (rows.length === 0) return <div className="debug-tree">{t('debug.noRoot')}</div>;

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
  const visible = rows.slice(first, last);

  return (
    <div
      ref={viewport}
      className="debug-tree"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="debug-tree-inner" style={{ height: rows.length * ROW_HEIGHT }}>
        {visible.map((row, index) => (
          <TreeRow
            key={row.block.id}
            row={row}
            changed={changed.has(row.block.id)}
            top={(first + index) * ROW_HEIGHT}
          />
        ))}
      </div>
    </div>
  );
});

const PREVIEW_CHILDREN = 20;

const previewBlock = (block: BaseBlock, { t, number }: SandboxI18n) =>
  block.children.length > PREVIEW_CHILDREN
    ? {
        ...block,
        children: [
          ...block.children.slice(0, PREVIEW_CHILDREN),
          t('debug.more', { count: number(block.children.length - PREVIEW_CHILDREN) }),
        ],
      }
    : block;

/**
 * Превью JSON: первые PREVIEW_BLOCKS блоков в порядке дерева с сокращёнными списками детей. Весь документ
 * из 50 000 блоков — десятки мегабайт текста, его раскладка в `<pre>` вешает страницу.
 */
function jsonPreview(document: Document, blockCount: number, i18n: SandboxI18n) {
  if (blockCount <= PREVIEW_BLOCKS) return truncate(JSON.stringify(document.dump(), null, 2), i18n);

  const preview: Record<string, unknown> = {};

  for (const { block } of flatten(document).slice(0, PREVIEW_BLOCKS)) {
    preview[block.id] = previewBlock(block, i18n);
  }

  return `${truncate(JSON.stringify(preview, null, 2), i18n)}\n${i18n.t('debug.jsonPreview', { shown: PREVIEW_BLOCKS, total: i18n.number(blockCount) })}`;
}

const JsonTab = memo(function JsonTab({
  document,
  snapshot,
}: {
  document: Document;
  snapshot: Snapshot;
}) {
  const i18n = useSandboxI18n();
  const json = useMemo(
    () => jsonPreview(document, snapshot.blockCount, i18n),
    [document, snapshot.version, snapshot.blockCount, i18n],
  );

  return (
    <>
      <CopyButton
        label={i18n.t('debug.copyJson')}
        text={() => JSON.stringify(document.dump(), null, 2)}
      />
      <pre className="debug-pre">{json}</pre>
    </>
  );
});

const EXPORT_FORMATS: ExportFormat[] = ['markdown', 'html', 'text'];

const ExportTab = memo(function ExportTab({
  document,
  editor,
  snapshot,
}: {
  document: Document;
  editor: Editor;
  snapshot: Snapshot;
}) {
  const i18n = useSandboxI18n();
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const compute = () => exportDocument(document, format, { schema: editor.schema });
  const result = useOnDemand(compute, snapshot, [document, format]);

  return (
    <>
      <div className="debug-row">
        {EXPORT_FORMATS.map((id) => (
          <button
            key={id}
            type="button"
            className={format === id ? 'is-active' : ''}
            onClick={() => setFormat(id)}
          >
            {id === 'text' ? i18n.t('debug.textFormat') : id === 'html' ? 'HTML' : 'Markdown'}
          </button>
        ))}
        <CopyButton label={i18n.t('debug.copy')} text={() => result.value ?? compute()} />
      </div>
      {result.large && (
        <OnDemandBar
          blockCount={snapshot.blockCount}
          computed={result.value !== null}
          stale={result.stale}
          run={result.run}
        />
      )}
      {result.value !== null && (
        <pre className="debug-pre" data-testid="debug-export">
          {truncate(result.value, i18n)}
        </pre>
      )}
    </>
  );
});

const LogItem = memo(function LogItem({ entry }: { entry: LogEntry }) {
  const { t } = useSandboxI18n();

  return (
    <li className={entry.error ? 'debug-log-item debug-log-item--error' : 'debug-log-item'}>
      <div>
        <b>{entry.type}</b>{' '}
        <span className="debug-id">
          v{entry.version} · {entry.time} · {entry.ms.toFixed(1)} {t('debug.ms')}
        </span>
      </div>
      {entry.error && <div className="debug-error">{entry.error}</div>}
      <details>
        <summary>payload</summary>
        <pre className="debug-pre">{entry.payload}</pre>
      </details>
    </li>
  );
});

function LogTab({ entries, clear }: { entries: LogEntry[]; clear: () => void }) {
  const { t } = useSandboxI18n();

  return (
    <>
      <button type="button" onClick={clear}>
        {t('debug.clear', { count: entries.length })}
      </button>
      <ol className="debug-log" reversed>
        {[...entries].reverse().map((entry) => (
          <LogItem key={entry.n} entry={entry} />
        ))}
      </ol>
    </>
  );
}

interface CaretInfo {
  blockId: string | null;
  anchorOffset: number;
  focusOffset: number;
  collapsed: boolean;
  selectedText: string;
}

function readCaret(): CaretInfo | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || !selection.anchorNode) return null;

  const element =
    selection.anchorNode instanceof Element
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
  const blockId = element?.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null;

  return {
    blockId,
    anchorOffset: selection.anchorOffset,
    focusOffset: selection.focusOffset,
    collapsed: selection.isCollapsed,
    selectedText: clip(selection.toString(), 2000),
  };
}

function CaretTab() {
  const { t } = useSandboxI18n();
  const [caret, setCaret] = useState<CaretInfo | null>(readCaret);

  useEffect(() => {
    const update = () => setCaret(readCaret());

    window.document.addEventListener('selectionchange', update);

    return () => window.document.removeEventListener('selectionchange', update);
  }, []);

  if (!caret) return <p>{t('debug.noSelection')}</p>;

  return <pre className="debug-pre">{JSON.stringify(caret, null, 2)}</pre>;
}

const PROBLEMS_SHOWN = 200;

const CheckTab = memo(function CheckTab({
  document,
  editor,
  snapshot,
}: {
  document: Document;
  editor: Editor;
  snapshot: Snapshot;
}) {
  const { t } = useSandboxI18n();
  const result = useOnDemand(() => validate(document, editor, t), snapshot, [document, editor, t]);
  const problems = result.value;

  return (
    <>
      {result.large && (
        <OnDemandBar
          blockCount={snapshot.blockCount}
          computed={problems !== null}
          stale={result.stale}
          run={result.run}
        />
      )}
      {problems === null ? null : problems.length === 0 ? (
        <p className="debug-ok">{t('debug.checkOk')}</p>
      ) : (
        <ul className="debug-problems">
          {problems.slice(0, PROBLEMS_SHOWN).map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
          {problems.length > PROBLEMS_SHOWN && (
            <li>{t('debug.more', { count: problems.length - PROBLEMS_SHOWN })}</li>
          )}
        </ul>
      )}
    </>
  );
});

export function DebugPanel() {
  const { t, number } = useSandboxI18n();
  const editor = useEditor();
  const readOnly = useReadOnly();
  const snapshot = usePanelSnapshot(editor);
  const log = useCommandLog(editor);
  const [tab, setTab] = useState<Tab>('tree');
  const [open, setOpen] = useState(true);
  const { document } = editor;

  if (!open) {
    return (
      <button type="button" className="debug-toggle" onClick={() => setOpen(true)}>
        Debug
      </button>
    );
  }

  return (
    <aside className="debug-panel" data-testid="debug-panel">
      <header className="debug-header">
        <b>Debug</b>
        <span className="debug-id">
          {t('debug.summary', {
            version: snapshot.version,
            blocks: number(snapshot.blockCount),
            history: snapshot.historyVersion,
          })}{' '}
          · {editor.canUndo ? 'undo' : '—'}/{editor.canRedo ? 'redo' : '—'}
          {readOnly ? ' · read-only' : ''}
        </span>
        <button type="button" onClick={() => setOpen(false)} aria-label={t('debug.collapse')}>
          ×
        </button>
      </header>
      <nav className="debug-tabs">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'is-active' : ''}
            onClick={() => setTab(id)}
          >
            {t(label)}
          </button>
        ))}
      </nav>
      <div className={tab === 'tree' ? 'debug-body debug-body--fill' : 'debug-body'}>
        {tab === 'tree' && <TreeTab document={document} version={snapshot.version} />}
        {tab === 'json' && <JsonTab document={document} snapshot={snapshot} />}
        {tab === 'export' && <ExportTab document={document} editor={editor} snapshot={snapshot} />}
        {tab === 'log' && <LogTab {...log} />}
        {tab === 'caret' && <CaretTab />}
        {tab === 'check' && <CheckTab document={document} editor={editor} snapshot={snapshot} />}
      </div>
    </aside>
  );
}
