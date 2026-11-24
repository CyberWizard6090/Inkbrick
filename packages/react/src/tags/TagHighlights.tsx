import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useSheet } from '../hooks/useSheet';
import { useT } from '../hooks/useT';
import { PortalPresence } from '../ui/Presence';
import { highlightsSupported, setHighlight } from '../editing/highlights';
import { findPoint, readDocSelection } from '../editing/selection';
import { collectTags } from './collect';
import { blockTags } from './parse';

export interface TagHighlightsProps {
  /** Ctrl/Cmd+клик по тегу: приложение открывает список заметок с этим тегом и т. п. Без него клик ничего не делает. */
  readonly onTagClick?: (tag: string, event: MouseEvent) => void;
  /** Дополнительные теги для подсказок (например, теги других заметок), без `#`. К ним добавляются теги документа. */
  readonly suggestions?: readonly string[];
  /** Показывать подсказки при наборе `#`. По умолчанию да; в режиме только чтения их нет. */
  readonly suggest?: boolean;
}

const HIGHLIGHT = 'inkbrick-tag';
const MAX_SUGGESTIONS = 8;
/** `#` и уже набранные знаки тега перед кареткой. */
const TYPING = /(?<![\p{L}\p{N}_#&/])#([\p{L}\p{N}_/-]*)$/u;

interface Suggestion {
  readonly blockId: string;
  /** Смещение `#` и каретки в тексте блока. */
  readonly hash: number;
  readonly caret: number;
  readonly query: string;
  readonly x: number;
  readonly y: number;
  readonly items: readonly string[];
  readonly active: number;
}

/**
 * Теги `#tag` в тексте: подсветка (CSS Custom Highlight API, документ не меняется), Ctrl/Cmd+клик (`onTagClick`) и подсказки
 * при наборе `#`. Тег остаётся обычным текстом, поэтому экспорт и вставка не меняются. Кладётся в `<EditorProvider>` рядом
 * с документом.
 *
 * ```tsx
 * <EditorProvider editor={editor}>
 *   <DocumentView />
 *   <TagHighlights onTagClick={(tag) => openTag(tag)} />
 * </EditorProvider>
 * ```
 */
export function TagHighlights({
  onTagClick,
  suggestions = [],
  suggest = true,
}: TagHighlightsProps) {
  const editor = useEditor();
  const view = useEditorView();
  const t = useT();
  // Телефон: подсказки — лист над экранной клавиатурой, а не окошко у каретки.
  const { sheet, inset } = useSheet();
  const readOnly = useReadOnly();
  const [open, setOpen] = useState<Suggestion | null>(null);
  const dismissed = useRef<string | null>(null);
  const click = useRef(onTagClick);
  const extra = useRef(suggestions);

  click.current = onTagClick;
  extra.current = suggestions;

  // Подсветка: перерисовывается после правок и прокрутки (виртуальный рендерер сменил блоки на странице).
  useEffect(() => {
    let frame = 0;

    const paint = () => {
      frame = 0;

      const root = view.getRoot();

      if (!root || !highlightsSupported()) return;

      const ranges: Range[] = [];

      for (const element of root.querySelectorAll<HTMLElement>('.editable[data-id]')) {
        const block = editor.store.getBlock(element.dataset.id!);

        if (!block) continue;

        for (const { from, to } of blockTags(block)) {
          const start = findPoint(element, from);
          const end = findPoint(element, to);

          if (!start || !end) continue;

          const range = document.createRange();

          range.setStart(start.node, start.offset);
          range.setEnd(end.node, end.offset);
          ranges.push(range);
        }
      }

      // Подсветка общая для страницы: теги других редакторов остаются.
      setHighlight(HIGHLIGHT, view, ranges);
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const unsubscribe = editor.store.subscribe(later);

    window.addEventListener('scroll', later, { capture: true, passive: true });
    later();

    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      window.removeEventListener('scroll', later, { capture: true });
      setHighlight(HIGHLIGHT, view, []);
    };
  }, [editor, view]);

  // Ctrl/Cmd+клик по тегу: каретка уже стоит там, куда нажали.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !click.current) return;

      const root = view.getRoot();

      if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return;

      const selection = readDocSelection(root);
      const block = selection && editor.store.getBlock(selection.from.blockId);

      if (!selection?.collapsed || !block) return;

      const hit = blockTags(block).find(
        ({ from, to }) => selection.from.offset >= from && selection.from.offset <= to,
      );

      if (hit) click.current(hit.tag, event);
    };

    document.addEventListener('click', onClick);

    return () => document.removeEventListener('click', onClick);
  }, [editor, view]);

  /** Набираемый сейчас тег по живому выделению; `null`, если подсказывать нечего. */
  const compute = (previous: Suggestion | null): Suggestion | null => {
    const root = view.getRoot();
    const selection = root ? readDocSelection(root) : null;
    const block = selection?.collapsed ? editor.store.getBlock(selection.from.blockId) : undefined;

    if (
      !selection ||
      !block ||
      block.flavour === 'block:code' ||
      block.flavour === 'block:formula'
    ) {
      return null;
    }

    const text = block.content.map((node) => node.insert).join('');
    const caret = selection.from.offset;
    const typing = TYPING.exec(text.slice(0, caret));

    if (!typing) return null;

    const hash = caret - typing[0].length;

    if (dismissed.current === `${block.id}:${hash}`) return null;

    const query = typing[1];
    const items = candidates(editor, extra.current, query);

    if (items.length === 0) return null;

    const native = globalThis.getSelection();
    const rect =
      (native && native.rangeCount > 0 ? native.getRangeAt(0).getClientRects()[0] : undefined) ??
      view.getElement(block.id)?.getBoundingClientRect();

    return {
      blockId: block.id,
      hash,
      caret,
      query,
      x: rect?.left ?? 0,
      y: rect?.bottom ?? 0,
      items,
      active:
        previous && previous.blockId === block.id && previous.query === query
          ? Math.min(previous.active, items.length - 1)
          : 0,
    };
  };

  // Подсказки: после правки и смены выделения ищем набираемый тег перед кареткой.
  useEffect(() => {
    if (!suggest || readOnly) {
      setOpen(null);
      return;
    }

    const detect = () => {
      const next = compute(null);

      // Отказ от прежнего `dismissed`: оно действует, пока каретка стоит в том же месте того же тега.
      if (!next)
        dismissed.current =
          dismissed.current && stillThere(dismissed.current) ? dismissed.current : null;

      setOpen((previous) => (next ? compute(previous) : null));
    };
    const stillThere = (mark: string) => {
      const root = view.getRoot();
      const selection = root ? readDocSelection(root) : null;

      return !!selection?.collapsed && mark.startsWith(`${selection.from.blockId}:`);
    };
    const unsubscribe = editor.store.subscribe(() => requestAnimationFrame(detect));

    document.addEventListener('selectionchange', detect);

    return () => {
      unsubscribe();
      document.removeEventListener('selectionchange', detect);
    };
  }, [editor, view, suggest, readOnly]);

  const apply = (suggestion: Suggestion, tag: string) => {
    editor.dispatch({
      type: 'replaceText',
      payload: {
        blockId: suggestion.blockId,
        from: suggestion.hash + 1,
        to: suggestion.caret,
        text: tag,
      },
    });
    view.placeCaret(suggestion.blockId, suggestion.hash + 1 + tag.length);
    setOpen(null);
  };

  // Клавиши меню перехватываются раньше редактора, пока оно открыто.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      const handled = ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key);

      if (!handled || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

      // Список обновляется по кадру, а клавиша могла прийти раньше: решаем по живому выделению, а не по устаревшему списку.
      const live = compute(open);

      if (!live) {
        setOpen(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        dismissed.current = `${live.blockId}:${live.hash}`;
        setOpen(null);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1;

        setOpen({ ...live, active: (live.active + step + live.items.length) % live.items.length });
      } else {
        apply(live, live.items[live.active]);
      }
    };

    document.addEventListener('keydown', onKey, true);

    return () => document.removeEventListener('keydown', onKey, true);
  });

  return (
    <PortalPresence
      open={!!open}
      render={() => {
        const shown = open!;

        return (
          <div
            className="inkbrick-tag-suggestions"
            data-inkbrick-ui="tag-suggestions"
            data-testid="tag-suggestions"
            role="listbox"
            aria-label={t('tags.suggestions')}
            data-sheet={sheet || undefined}
            style={
              sheet
                ? ({ bottom: inset, '--inkbrick-keyboard': `${inset}px` } as CSSProperties)
                : { left: shown.x, top: shown.y + 4 }
            }
            onMouseDown={(event) => event.preventDefault()}
          >
            {shown.items.map((tag, index) => (
              <div
                key={tag}
                role="option"
                aria-selected={index === shown.active}
                data-inkbrick-part="item"
                data-active={index === shown.active || undefined}
                data-tag={tag}
                onMouseEnter={() => setOpen({ ...shown, active: index })}
                onClick={() => apply(shown, tag)}
              >
                #{tag}
              </div>
            ))}
          </div>
        );
      }}
    />
  );
}

/** Подсказки по набранному началу: теги документа и теги приложения, по убыванию числа упоминаний, без уже набранного целиком. */
function candidates(
  editor: ReturnType<typeof useEditor>,
  extra: readonly string[],
  query: string,
): string[] {
  const wanted = query.toLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of [...collectTags(editor).map(({ tag }) => tag), ...extra]) {
    const key = tag.toLowerCase();

    if (seen.has(key) || key === wanted || !key.startsWith(wanted)) continue;

    seen.add(key);
    result.push(tag);

    if (result.length >= MAX_SUGGESTIONS) break;
  }

  return result;
}
