import { useEffect } from 'react';

import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { useEditorUI } from '../ui/EditorUIContext';
import { PortalPresence } from '../ui/Presence';
import { blockElement } from './geometry';
import type { DropIndicatorProps } from './types';
import { useBlockDragState } from './useBlockDrag';

export function DefaultDropIndicator({ indicator, position, side }: DropIndicatorProps) {
  return (
    <div
      className="inkbrick-drop-indicator"
      data-inkbrick-ui="drop-indicator"
      data-testid="drop-indicator"
      data-position={position}
      data-side={side}
      style={{
        left: indicator.left,
        top: indicator.top,
        width: indicator.width,
        height: indicator.height,
      }}
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

  const Indicator = slots.DropIndicator ?? DefaultDropIndicator;
  const open =
    !readOnly &&
    slots.DropIndicator !== null &&
    typeof document !== 'undefined' &&
    !!drag?.indicator &&
    !!drag.targetId &&
    !!drag.position;

  return (
    <PortalPresence
      reuse
      open={open}
      render={() => (
        <Indicator
          blockId={drag!.blockId}
          targetId={drag!.targetId!}
          position={drag!.position!}
          side={drag!.side ?? undefined}
          indicator={drag!.indicator!}
        />
      )}
    />
  );
}
