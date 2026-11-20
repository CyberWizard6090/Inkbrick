import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import type { BlockHandleProps } from './types';

const HANDLE_WIDTH = 52;
/** Ручка таблицы — одна, без «+»: перетаскивание и меню блока. */
const CORNER_WIDTH = 24;

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
  const editor = useEditor();
  const view = useEditorView();
  // Ручка не выходит за левый край документа: полоса для неё — внутренний отступ корня.
  const edge = Math.max(2, Math.round(view.getRoot()?.getBoundingClientRect().left ?? 0));
  // Таблица: ручка стоит над левым верхним углом сетки (см. `useBlockHandles`) и состоит из одной кнопки.
  const corner = editor.store.getBlock(blockId)?.flavour === 'block:table';
  const left = position.x - (corner ? CORNER_WIDTH : HANDLE_WIDTH);
  const compact = !corner && left < edge;

  return (
    <div
      className="inkbrick-block-handle"
      data-inkbrick-ui="block-handle"
      data-testid="block-handle"
      data-block={blockId}
      data-inkbrick-block-ui
      // Слева от текста нет места (узкий экран): ручка ложится поверх текста отдельной плашкой.
      data-compact={compact || undefined}
      data-corner={corner || undefined}
      style={{
        // Ручка таблицы может лечь на поле карточки слева от корня: там под ней нет текста, а справа лежат маркеры.
        left: Math.max(corner ? 2 : edge, left),
        top: position.y,
        pointerEvents: dragging ? 'none' : undefined,
      }}
      // Не уводим фокус и выделение из редактора.
      onMouseDown={(event) => event.preventDefault()}
    >
      {!corner && (
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
      )}
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
