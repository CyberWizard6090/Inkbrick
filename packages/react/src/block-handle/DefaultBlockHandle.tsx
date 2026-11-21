import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import type { BlockHandleProps } from './types';

const HANDLE_WIDTH = 52;
/** Зазор между ручкой и блоком: ручка не ложится на рамку и элементы управления блока (картинки, кода, таблицы). */
const HANDLE_GAP = 8;
/** На сколько ручка может выйти за левый край корня редактора (на поле страницы). */
const OVERFLOW = 32;
/**
 * Узкий экран, таблица: компактная ручка ложилась бы на ручку первой строки и маркеры вставки слева от сетки. Она встаёт
 * над таблицей, выше ряда ручек столбца (они на 22 px над сеткой).
 */
const TABLE_LIFT = 54;
/** Ручка блока во второй и следующих колонках: только «⠿», в промежутке между колонками, с этим зазором до блока. */
const GRIP_WIDTH = 24;
const NARROW_GAP = 4;

/**
 * Блок лежит не в первой колонке блока колонок: слева от него только промежуток (32 px), полная ручка («+» и «⠿») легла
 * бы на соседнюю колонку. Там остаётся одна «⠿».
 */
function inLaterColumn(element: Element | null | undefined): boolean {
  const column = element?.closest('[data-inkbrick-block="column"]');
  const previous = column?.previousElementSibling;

  if (!column || !previous?.matches('[data-inkbrick-block="column"]')) return false;

  // На узком экране колонки встают друг под другом: слева место есть, ручка обычная.
  const here = column.getBoundingClientRect();
  const before = previous.getBoundingClientRect();

  return before.right <= here.left + 1 && before.top < here.bottom && before.bottom > here.top;
}

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
  // Полоса для ручки — внутренний отступ корня; ручка может выйти за его левый край не дальше `OVERFLOW` (на поле страницы,
  // но не на соседнюю панель приложения) и не за край окна. Места нет (узкий экран) — компактная плашка поверх текста.
  const edge = Math.max(
    2,
    Math.round((view.getRoot()?.getBoundingClientRect().left ?? 0) - OVERFLOW),
  );
  const narrow = inLaterColumn(
    view.getRoot()?.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`),
  );
  const left = narrow
    ? position.x - GRIP_WIDTH - NARROW_GAP
    : position.x - HANDLE_WIDTH - HANDLE_GAP;
  const compact = !narrow && left < edge;
  const lifted = compact && editor.store.getBlock(blockId)?.flavour === 'block:table';

  return (
    <div
      className="inkbrick-block-handle"
      data-inkbrick-ui="block-handle"
      data-testid="block-handle"
      data-block={blockId}
      data-inkbrick-block-ui
      // Слева от текста нет места (узкий экран): ручка ложится поверх текста отдельной плашкой.
      data-compact={compact || undefined}
      data-narrow={narrow || undefined}
      style={{
        left: narrow ? left : Math.max(edge, left),
        top: lifted ? position.y - TABLE_LIFT : position.y,
        pointerEvents: dragging ? 'none' : undefined,
      }}
      // Не уводим фокус и выделение из редактора.
      onMouseDown={(event) => event.preventDefault()}
    >
      {!narrow && (
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
