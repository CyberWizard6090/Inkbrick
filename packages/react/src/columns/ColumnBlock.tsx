import { useContext, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import type { BlockProps } from '../blocks/BlockProps';
import { BlockChildren } from '../blocks/BlockChildren';
import { useT } from '../hooks/useT';
import { ColumnsContext } from './ColumnsContext';

/** Одна колонка: её блоки и разделитель справа (кроме последней колонки). */
export function ColumnBlock({ block, selected }: BlockProps) {
  const t = useT();
  const layout = useContext(ColumnsContext);
  const index = layout?.ids.indexOf(block.id) ?? -1;
  const last = !layout || index === layout.ids.length - 1;

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !layout) return;

    event.preventDefault();
    event.stopPropagation();
    layout.onDrag(index, event.nativeEvent);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;

    if (delta === 0 || !layout) return;

    event.preventDefault();
    event.stopPropagation();
    layout.onKey(index, delta);
  };

  return (
    <div
      className="block block-column"
      data-inkbrick-block="column"
      data-block-id={block.id}
      data-selected={selected || undefined}
    >
      <BlockChildren id={block.id} />
      {!last && !layout?.readOnly && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round((layout?.shares[index] ?? 0) * 100)}
          aria-valuemin={8}
          aria-valuemax={100}
          aria-label={t('columns.resize', { column: index + 1 })}
          tabIndex={0}
          contentEditable={false}
          data-inkbrick-part="divider"
          data-inkbrick-block-ui=""
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
        />
      )}
    </div>
  );
}
