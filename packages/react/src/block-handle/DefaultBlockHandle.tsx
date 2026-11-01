import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import type { BlockHandleProps } from './types';

const HANDLE_WIDTH = 52;

export function DefaultBlockHandle({
  blockId,
  position,
  canAdd,
  dragging,
  menuOpen,
  onAdd,
  onOpenMenu,
  gripProps,
}: BlockHandleProps) {
  const t = useT();
  const left = position.x - HANDLE_WIDTH;

  return (
    <div
      className="inkbrick-block-handle"
      data-inkbrick-ui="block-handle"
      data-testid="block-handle"
      data-block={blockId}
      data-inkbrick-block-ui
      // Слева от текста нет места (узкий экран): ручка ложится поверх текста отдельной плашкой.
      data-compact={left < 2 || undefined}
      style={{
        left: Math.max(2, left),
        top: position.y,
        pointerEvents: dragging ? 'none' : undefined,
      }}
      // Не уводим фокус и выделение из редактора.
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="inkbrick-block-handle__button"
        data-inkbrick-part="button"
        aria-label={t('handle.add')}
        title={t('handle.add')}
        data-action="add"
        disabled={!canAdd}
        onClick={onAdd}
      >
        <Icon name="plus" />
      </button>
      <button
        type="button"
        className="inkbrick-block-handle__button inkbrick-block-handle__grip"
        data-inkbrick-part="grip"
        data-active={menuOpen || undefined}
        aria-label={t('handle.grip')}
        title={t('handle.grip')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-action="grip"
        {...gripProps}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpenMenu();
          }
        }}
      >
        <Icon name="grip" />
      </button>
    </div>
  );
}
