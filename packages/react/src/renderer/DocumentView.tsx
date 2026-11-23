import { useEffect, useLayoutEffect, useRef } from 'react';

import { LazyBlockHandles } from '../block-handle/LazyBlockHandles';
import { useClipboard } from '../clipboard/useClipboard';
import { ContextMenuHost, useContextMenu } from '../context-menu/ContextMenuHost';
import { useSelectionSync } from '../editing/useSelectionSync';
import { useEditorInput } from '../editing/useEditorInput';
import { useMarginClick } from '../editing/useMarginClick';
import { useSelectionState } from '../editing/useSelectionState';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useT } from '../hooks/useT';
import { useEditorUI } from '../ui/EditorUIContext';
import { FormulaPopoverHost } from '../formula/FormulaPopoverHost';
import { preloadFormulaPalette } from '../formula/LazyFormulaPalette';
import { preloadSoon } from '../ui/lazy';
import { installTooltips } from '../ui/tooltips';
import { preloadIcons } from '../icons/Icon';
import { SlashMenuHost } from '../slash/SlashMenuHost';
import { ToolbarHost } from '../toolbar/ToolbarHost';
import { BlockRenderer } from './BlockRenderer';
import { DocumentRendererContext, fullRenderer, type DocumentRenderer } from './DocumentRenderer';
import { defaultVirtualRenderer } from './virtual/virtualRenderer';

export interface DocumentViewProps {
  readonly label?: string;
  /**
   * Как рисовать блоки: `'full'` (по умолчанию) — всё дерево; `'virtual'` или `virtualRenderer({...})` — только
   * блоки около видимой области (для документов на тысячи блоков); либо свой `DocumentRenderer`.
   */
  readonly renderer?: 'full' | 'virtual' | DocumentRenderer;
}

function resolveRenderer(renderer: DocumentViewProps['renderer']): DocumentRenderer {
  if (renderer === 'virtual') return defaultVirtualRenderer;
  if (!renderer || renderer === 'full') return fullRenderer;
  return renderer;
}

/**
 * Единственный редактируемый элемент документа. Все блоки лежат внутри него, поэтому
 * выделение работает через границы блоков; ввод перехватывается и превращается в команды движка.
 */
export function DocumentView({ label, renderer }: DocumentViewProps = {}) {
  const editor = useEditor();
  const view = useEditorView();
  const ref = useRef<HTMLDivElement>(null);

  const { slots, formatting, spellcheck } = useEditorUI();

  const readOnly = useReadOnly();
  const t = useT();

  useEditorInput(ref, !readOnly);
  useSelectionSync(ref);
  useMarginClick(ref, !readOnly);
  useContextMenu(ref, !readOnly && formatting !== 'toolbar' && slots.ContextMenu !== null);
  useSelectionState(ref);
  useClipboard(ref, readOnly);

  useLayoutEffect(() => view.setRoot(ref.current), [view]);

  // Подсказки кнопок редактора — своя плашка в цветах темы вместо системной (`title`), одна на страницу.
  useEffect(() => installTooltips(), []);

  // Пока блоки выбраны целиком, мигающая каретка скрыта: она «припаркована» браузером в начале документа.
  useEffect(
    () =>
      view.picked.subscribe(() =>
        ref.current?.toggleAttribute('data-picking', view.picked.size > 0),
      ),
    [view],
  );

  /*
   * Палитру формул (отдельный чанк ~5 КБ) начинаем грузить сразу после первой отрисовки: она не задерживает
   * открытие документа, но готова к первому редактору формулы (Tab из поля кода ведёт в палитру).
   */
  useEffect(() => {
    if (readOnly) return;

    void preloadFormulaPalette();
    void preloadIcons();

    // Блоки кода и формулы тоже отдельные чанки: подгружаем их сразу после отрисовки, чтобы новый блок принимал ввод.
    return preloadSoon();
  }, [readOnly]);

  return (
    <>
      <div
        ref={ref}
        className="inkbrick-editor"
        data-inkbrick-root=""
        contentEditable={!readOnly}
        suppressContentEditableWarning
        spellCheck={!readOnly && !!spellcheck}
        lang={spellcheck ? spellcheck.lang : undefined}
        role="textbox"
        aria-multiline="true"
        aria-label={label ?? t('editor.label')}
        // Документ только для чтения должен получать фокус: так работают Ctrl+A и Ctrl+C с клавиатуры.
        tabIndex={readOnly ? 0 : undefined}
        aria-readonly={readOnly || undefined}
        data-readonly={readOnly || undefined}
      >
        <DocumentRendererContext.Provider value={resolveRenderer(renderer)}>
          <BlockRenderer id={editor.document.rootId} />
        </DocumentRendererContext.Provider>
      </div>
      <SlashMenuHost />
      <ToolbarHost />
      <ContextMenuHost />
      <FormulaPopoverHost />
      <LazyBlockHandles rootRef={ref} handles={slots.BlockHandle !== null} />
    </>
  );
}
