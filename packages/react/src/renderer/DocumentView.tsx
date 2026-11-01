import { useEffect, useLayoutEffect, useRef } from 'react';

import { BlockHandleHost } from '../block-handle/BlockHandleHost';
import { DropIndicatorHost } from '../block-handle/DropIndicatorHost';
import { useClipboard } from '../clipboard/useClipboard';
import { useBlockHandles } from '../block-handle/useBlockHandles';
import { useEditorInput } from '../editing/useEditorInput';
import { useSelectionState } from '../editing/useSelectionState';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useT } from '../hooks/useT';
import { useEditorUI } from '../ui/EditorUIContext';
import { FormulaPopover } from '../formula/FormulaPopover';
import { preloadFormulaPalette } from '../formula/LazyFormulaPalette';
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

  const { slots } = useEditorUI();

  const readOnly = useReadOnly();
  const t = useT();

  useEditorInput(ref, !readOnly);
  useSelectionState(ref);
  useClipboard(ref, readOnly);
  useBlockHandles(ref, slots.BlockHandle !== null && !readOnly);

  useLayoutEffect(() => view.setRoot(ref.current), [view]);

  /*
   * Палитру формул (отдельный чанк ~5 КБ) начинаем грузить сразу после первой отрисовки: она не задерживает
   * открытие документа, но готова к первому редактору формулы (Tab из поля кода ведёт в палитру).
   */
  useEffect(() => {
    if (!readOnly) void preloadFormulaPalette();
  }, [readOnly]);

  return (
    <>
      <div
        ref={ref}
        className="inkbrick-editor"
        data-inkbrick-root=""
        contentEditable={!readOnly}
        suppressContentEditableWarning
        spellCheck={false}
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
      <FormulaPopover />
      <BlockHandleHost />
      <DropIndicatorHost />
    </>
  );
}
