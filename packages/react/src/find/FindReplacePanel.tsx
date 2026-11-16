import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useT } from '../hooks/useT';
import { getFindController } from './FindController';

/**
 * Панель поиска и замены. Кладётся в `<EditorProvider>` рядом с документом; открывают её Ctrl/Cmd+F (поиск) и
 * Ctrl/Cmd+H (замена) из `findReplace.keymap` или `useFind().open()`. Enter — следующее совпадение, Shift+Enter — предыдущее,
 * Esc — закрыть и выделить найденное.
 */
export function FindReplacePanel() {
  const editor = useEditor();
  const view = useEditorView();
  const t = useT();
  const readOnly = useReadOnly();
  const controller = getFindController(editor, view);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  const input = useRef<HTMLInputElement>(null);
  const { open, nonce } = state;

  // Правка документа сдвигает совпадения; прокрутка отрисовывает другие блоки (виртуальный рендерер) — подсветку обновляем.
  useEffect(() => {
    if (!open) return;

    let frame = 0;
    const later = (action: () => void) => {
      if (frame) return;

      frame = requestAnimationFrame(() => {
        frame = 0;
        action();
      });
    };
    const unsubscribe = editor.store.subscribe(() => later(() => controller.refresh()));
    const onScroll = () => later(() => controller.paint());

    window.addEventListener('scroll', onScroll, { capture: true, passive: true });

    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [open, editor, controller]);

  // Esc закрывает панель, где бы ни был фокус (отключённая кнопка отдаёт его странице); меню и другие окна, которые уже
  // обработали Esc, панель не закрывают.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;

      event.preventDefault();
      controller.closeAndSelect();
    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [open, controller]);

  useEffect(() => {
    if (!open) return;

    input.current?.focus();
    input.current?.select();
  }, [open, nonce]);

  useEffect(() => () => controller.close(), [controller]);

  if (!open || typeof document === 'undefined') return null;

  const total = state.matches.length;
  const status =
    state.query === '' ? '' : total === 0 ? t('find.none') : `${state.current + 1} / ${total}`;
  const canReplace = !readOnly && total > 0;

  return createPortal(
    <div
      className="inkbrick-find"
      data-inkbrick-ui="find"
      data-testid="find-panel"
      role="search"
      aria-label={t('find.label')}
    >
      <div data-inkbrick-part="row">
        {!readOnly && (
          <button
            type="button"
            data-inkbrick-part="expand"
            data-active={state.replace || undefined}
            aria-expanded={state.replace}
            aria-label={t('find.toggleReplace')}
            title={t('find.toggleReplace')}
            onClick={() => controller.toggleReplace()}
          >
            ›
          </button>
        )}
        <input
          ref={input}
          data-inkbrick-part="query"
          type="text"
          value={state.query}
          placeholder={t('find.query')}
          aria-label={t('find.query')}
          spellCheck={false}
          onChange={(event) => controller.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              controller.go(event.shiftKey ? -1 : 1);
            }
          }}
        />
        <span data-inkbrick-part="status" aria-live="polite">
          {status}
        </span>
        <button
          type="button"
          data-inkbrick-part="case"
          data-active={state.caseSensitive || undefined}
          aria-pressed={state.caseSensitive}
          aria-label={t('find.caseSensitive')}
          title={t('find.caseSensitive')}
          onClick={() => controller.setOptions({ caseSensitive: !state.caseSensitive })}
        >
          Aa
        </button>
        <button
          type="button"
          data-inkbrick-part="word"
          data-active={state.wholeWord || undefined}
          aria-pressed={state.wholeWord}
          aria-label={t('find.wholeWord')}
          title={t('find.wholeWord')}
          onClick={() => controller.setOptions({ wholeWord: !state.wholeWord })}
        >
          ab
        </button>
        <button
          type="button"
          data-inkbrick-part="prev"
          disabled={total === 0}
          aria-label={t('find.prev')}
          title={t('find.prev')}
          onClick={() => controller.go(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          data-inkbrick-part="next"
          disabled={total === 0}
          aria-label={t('find.next')}
          title={t('find.next')}
          onClick={() => controller.go(1)}
        >
          ↓
        </button>
        <button
          type="button"
          data-inkbrick-part="close"
          aria-label={t('find.close')}
          title={t('find.close')}
          onClick={() => controller.closeAndSelect()}
        >
          ×
        </button>
      </div>

      {state.replace && !readOnly && (
        <div data-inkbrick-part="row">
          <input
            data-inkbrick-part="replacement"
            type="text"
            value={state.replacement}
            placeholder={t('find.replacement')}
            aria-label={t('find.replacement')}
            spellCheck={false}
            onChange={(event) => controller.setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                controller.replaceCurrent();
              }
            }}
          />
          <button
            type="button"
            data-inkbrick-part="replace"
            disabled={!canReplace}
            onClick={() => controller.replaceCurrent()}
          >
            {t('find.replace')}
          </button>
          <button
            type="button"
            data-inkbrick-part="replace-all"
            disabled={!canReplace}
            onClick={() => controller.replaceAll()}
          >
            {t('find.replaceAll')}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
