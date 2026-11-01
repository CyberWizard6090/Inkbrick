import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useEditorUI } from '../ui/EditorUIContext';
import { blockElement } from './geometry';
import type { DropIndicatorProps } from './types';
import { useBlockDragState } from './useBlockDrag';

export function DefaultDropIndicator({ indicator, position }: DropIndicatorProps) {
  return (
    <div
      className="inkbrick-drop-indicator"
      data-inkbrick-ui="drop-indicator"
      data-testid="drop-indicator"
      data-position={position}
      style={{ left: indicator.left, top: indicator.top, width: indicator.width }}
    />
  );
}

/**
 * Линия вставки и затемнение переносимого блока. Рисуется по состоянию API переноса,
 * поэтому работает и со встроенным перетаскиванием, и со своим (`useBlockDrag`), даже без ручек.
 */
export function DropIndicatorHost() {
  const view = useEditorView();
  const { slots } = useEditorUI();
  const readOnly = useReadOnly();
  const drag = useBlockDragState();
  const draggedId = drag?.blockId;

  useEffect(() => {
    if (!draggedId) return;

    const element = blockElement(view, draggedId);

    element?.setAttribute('data-inkbrick-dragging', 'true');

    return () => element?.removeAttribute('data-inkbrick-dragging');
  }, [draggedId, view]);

  if (readOnly || slots.DropIndicator === null || typeof document === 'undefined') return null;
  if (!drag?.indicator || !drag.targetId || !drag.position) return null;

  const Indicator = slots.DropIndicator ?? DefaultDropIndicator;

  return createPortal(
    <Indicator
      blockId={drag.blockId}
      targetId={drag.targetId}
      position={drag.position}
      indicator={drag.indicator}
    />,
    document.body,
  );
}
