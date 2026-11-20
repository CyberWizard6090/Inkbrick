import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { hideKeyboard, useSheet } from '../hooks/useSheet';
import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import { PortalPresence } from '../ui/Presence';
import type { ContextMenuItem, ContextMenuProps } from './types';

const MARGIN = 8;

export function DefaultContextMenu({
  position,
  formatting,
  items,
  onClose,
  onDismiss,
}: ContextMenuProps) {
  const t = useT();
  const { sheet, inset } = useSheet();
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: position.x, top: position.y });
  // Меню открылось над точкой клика: при появлении оно выезжает снизу.
  const [above, setAbove] = useState(false);

  // Меню целиком в окне: у правого/нижнего края открывается влево/вверх от точки клика.
  useLayoutEffect(() => {
    const menu = ref.current;

    // Лист снизу экрана положения не считает.
    if (!menu || sheet) return;

    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = position.x + width + MARGIN > window.innerWidth ? position.x - width : position.x;
    const top =
      position.y + height + MARGIN > window.innerHeight ? position.y - height : position.y;

    setAbove(position.y + height + MARGIN > window.innerHeight);
    setPlace({
      left: Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN)),
    });
  }, [position.x, position.y, formatting !== null, sheet]);

  // Лист на телефоне без кнопок форматирования: экранная клавиатура не закрывает его (кнопкам нужен курсор в тексте).
  useLayoutEffect(() => {
    if (sheet && !formatting) hideKeyboard();
  }, [sheet]);

  // Без кнопок форматирования фокус — на первом пункте, чтобы меню работало со стрелок.
  useEffect(() => {
    if (formatting) return;

    ref.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
      ?.focus({ preventScroll: true });
  }, []);

  const move = (delta: number) => {
    const entries = [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? []),
    ];
    const index = entries.indexOf(document.activeElement as HTMLElement);

    entries[(index + delta + entries.length) % entries.length]?.focus();
  };

  const run = (item: ContextMenuItem) => {
    if (!item.disabled) item.run();
  };

  return (
    <>
      {sheet && <SheetBackdrop onClose={onDismiss ?? onClose} />}
      <div
        ref={ref}
        className="inkbrick-context-menu"
        data-inkbrick-ui="context-menu"
        data-testid="context-menu"
        data-side={above ? 'top' : 'bottom'}
        data-sheet={sheet || undefined}
        role="menu"
        aria-label={t('contextMenu.label')}
        style={sheet ? { bottom: inset } : place}
        // Клик по меню не уводит выделение из документа (кроме поля ссылки внутри кнопок форматирования).
        onMouseDown={(event) => {
          if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
        }}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.target instanceof HTMLInputElement) return;

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            move(1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            move(-1);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      >
        {formatting}
        {formatting && items.length > 0 && <div data-inkbrick-part="separator" role="separator" />}
        <MenuList items={items} onRun={run} />
      </div>
    </>
  );
}

/**
 * Затемнение за листом: касание по нему закрывает меню и не доходит до документа под ним. У вложенного листа своё
 * затемнение поверх родительского листа: касание «мимо» закрывает только вложенную панель и не задевает пункты
 * родителя, которые иначе оставались бы видны и нажимались.
 */
export function SheetBackdrop({ onClose, nested }: { onClose: () => void; nested?: boolean }) {
  return (
    <div
      data-inkbrick-ui="context-menu"
      data-inkbrick-block-ui
      data-inkbrick-part="sheet-backdrop"
      data-nested={nested || undefined}
      aria-hidden="true"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        // Вложенное затемнение лежит в портале, но по дереву React это потомок пункта: его клик не должен открыть панель снова.
        event.stopPropagation();
        onClose();
      }}
    />
  );
}

/** Список пунктов: общий для самого меню и его вложенных панелей. Открытой может быть одна вложенная панель на уровне. */
function MenuList({
  items,
  onRun,
}: {
  items: readonly ContextMenuItem[];
  onRun: (item: ContextMenuItem) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          {item.separatorBefore && index > 0 && (
            <div data-inkbrick-part="separator" role="separator" />
          )}
          {item.content !== undefined ? (
            <>
              <div data-inkbrick-part="label" role="presentation">
                {item.title}
              </div>
              <div data-inkbrick-part="section" data-section={item.id}>
                {item.content}
              </div>
            </>
          ) : (
            <Row
              item={item}
              open={openId === item.id}
              setOpen={(open) => setOpenId(open ? item.id : null)}
              onRun={onRun}
            />
          )}
        </Fragment>
      ))}
    </>
  );
}

function Row({
  item,
  open,
  setOpen,
  onRun,
}: {
  item: ContextMenuItem;
  open: boolean;
  setOpen: (open: boolean) => void;
  onRun: (item: ContextMenuItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Фокус переходит во вложенную панель, только если она открыта с клавиатуры.
  const [byKeyboard, setByKeyboard] = useState(false);
  const nested = (item.submenu !== undefined || item.flyout !== undefined) && !item.disabled;
  const checkable = item.checked !== undefined;

  return (
    <div
      ref={ref}
      role={checkable ? 'menuitemradio' : 'menuitem'}
      aria-checked={checkable ? item.checked : undefined}
      aria-haspopup={nested ? 'menu' : undefined}
      aria-expanded={nested ? open : undefined}
      tabIndex={item.disabled ? -1 : 0}
      aria-disabled={item.disabled || undefined}
      data-action={item.id}
      data-inkbrick-part="item"
      data-disabled={item.disabled || undefined}
      data-checked={item.checked || undefined}
      className="inkbrick-context-menu__item"
      // Наведение открывает вложенную панель этого пункта и закрывает панель соседнего. В узком окне панель ляжет поверх
      // меню, прямо под указатель, и наведение открыло бы следующую — там она открывается только кликом.
      onPointerEnter={(event) => {
        // Вход в саму вложенную панель React тоже считает входом в пункт (панель — его потомок через портал): пункт при
        // этом не меняется, иначе панель поверх меню закрывалась бы, едва до неё дотронулись.
        if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;

        setByKeyboard(false);
        setOpen(nested && hasSideRoom(event.currentTarget));
      }}
      onClick={() => {
        // Клик по пункту с подменю открывает его (наведение уже открыло): переключение закрывало бы его сразу.
        if (nested) {
          setByKeyboard(false);
          setOpen(true);
        } else onRun(item);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;

        if (event.key === 'Enter' || event.key === ' ' || (nested && event.key === 'ArrowRight')) {
          event.preventDefault();
          event.stopPropagation();

          if (nested) {
            setByKeyboard(true);
            setOpen(true);
          } else onRun(item);
        }
      }}
    >
      {item.icon !== undefined && (
        <span className="inkbrick-context-menu__icon" data-inkbrick-part="icon">
          {item.icon}
        </span>
      )}
      {item.title}
      {item.shortcut && (
        <span className="inkbrick-context-menu__shortcut" data-inkbrick-part="shortcut">
          {item.shortcut}
        </span>
      )}
      {item.checked && (
        <span data-inkbrick-part="check" aria-hidden="true">
          <Icon name="check" />
        </span>
      )}
      {nested && (
        <span data-inkbrick-part="chevron" aria-hidden="true">
          <Icon name="chevron-right" />
        </span>
      )}
      {nested && (
        <PortalPresence
          open={open}
          render={() => (
            <Flyout
              anchor={ref}
              item={item}
              focusFirst={byKeyboard}
              onBack={() => {
                setOpen(false);
                ref.current?.focus();
              }}
              onRun={onRun}
            />
          )}
        />
      )}
    </div>
  );
}

/** Что в меню получает фокус: пункты и кнопки панелей (палитра, галерея), кроме отключённых. */
const FOCUSABLE = '[role^="menuitem"]:not([aria-disabled="true"]), button:not(:disabled)';

/** Уже этого панель рядом с меню не кладётся: она ложится поверх него. */
const MIN_FLYOUT_WIDTH = 180;

/** Помещается ли панель пункта сбоку от меню (иначе она ляжет поверх него). */
function hasSideRoom(row: Element): boolean {
  const rect = row.getBoundingClientRect();

  return (
    Math.max(window.innerWidth - MARGIN - (rect.right + 4), rect.left - 4 - MARGIN) >=
    MIN_FLYOUT_WIDTH
  );
}

/**
 * Вложенная панель справа от пункта (слева, если справа не хватает места); целиком остаётся в окне.
 * В узком окне, где места нет ни с одной стороны, — поверх меню.
 */
function Flyout({
  anchor,
  item,
  focusFirst,
  onBack,
  onRun,
}: {
  anchor: { readonly current: HTMLElement | null };
  item: ContextMenuItem;
  focusFirst: boolean;
  onBack: () => void;
  onRun: (item: ContextMenuItem) => void;
}) {
  const t = useT();
  const { sheet, inset } = useSheet();
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{
    left: number;
    top: number;
    maxWidth?: number;
    maxHeight?: number;
  } | null>(null);

  useLayoutEffect(() => {
    const panel = ref.current;
    const row = anchor.current?.getBoundingClientRect();

    // Лист снизу экрана положения не считает.
    if (!panel || !row || sheet) return;

    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    // Справа или слева от пункта — с той стороны, где больше места. Если места меньше, чем нужно панели, она сужается
    // (палитра и галерея переносятся по строкам), а не ложится поверх родительского меню.
    const roomRight = window.innerWidth - MARGIN - (row.right + 4);
    const roomLeft = row.left - 4 - MARGIN;
    const onRight = roomRight >= roomLeft;
    const room = Math.max(roomRight, roomLeft);
    // Узкое окно (телефон): родительское меню занимает почти всю ширину, и ни с одной стороны панели не поместиться.
    // Тогда она ложится поверх меню у правого края, во всю доступную ширину.
    const overlay = room < Math.min(width, MIN_FLYOUT_WIDTH);
    const fitted = overlay
      ? Math.min(width, window.innerWidth - 2 * MARGIN)
      : Math.min(width, room);
    const left = overlay
      ? window.innerWidth - fitted - MARGIN
      : onRight
        ? row.right + 4
        : row.left - 4 - fitted;
    // Выше окна панель не бывает: длинная прокручивается внутри.
    const maxHeight = window.innerHeight - 2 * MARGIN;
    const shown = Math.min(height, maxHeight);

    setPlace({
      left: Math.max(MARGIN, Math.min(left, window.innerWidth - fitted - MARGIN)),
      top: Math.max(MARGIN, Math.min(row.top - 4, window.innerHeight - shown - MARGIN)),
      maxWidth: fitted < width ? fitted : undefined,
      maxHeight: height > maxHeight ? maxHeight : undefined,
    });
  }, [anchor, sheet]);

  useEffect(() => {
    // Панель скрыта, пока не получила позицию (см. `place`): фокус ставим только после этого.
    if (!focusFirst || (!place && !sheet)) return;

    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
  }, [focusFirst, place, sheet]);

  const move = (delta: number) => {
    const entries = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const index = entries.indexOf(document.activeElement as HTMLElement);

    entries[(index + delta + entries.length) % entries.length]?.focus();
  };

  const keys = (event: ReactKeyboardEvent) => {
    // Клавиши панели не доходят до главного меню (React пускает события через портал вверх по дереву).
    event.stopPropagation();

    if (event.target instanceof HTMLInputElement) return;

    if (event.key === 'ArrowLeft' || event.key === 'Escape') {
      event.preventDefault();
      onBack();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    }
  };

  return (
    <>
      {sheet && <SheetBackdrop nested onClose={onBack} />}
      <div
        ref={ref}
        className="inkbrick-context-menu"
        data-inkbrick-ui="context-menu"
        data-inkbrick-part="flyout"
        data-flyout={item.id}
        data-sheet={sheet || undefined}
        role="menu"
        aria-label={item.title || t('contextMenu.label')}
        style={
          sheet
            ? { bottom: inset }
            : {
                left: place?.left ?? 0,
                top: place?.top ?? 0,
                maxWidth: place?.maxWidth,
                // `min-width` из стилей меню не должен перебивать сужение под окно.
                minWidth: place?.maxWidth !== undefined ? 0 : undefined,
                maxHeight: place?.maxHeight,
                overflowY: place?.maxHeight !== undefined ? 'auto' : undefined,
                visibility: place ? undefined : 'hidden',
              }
        }
        onMouseDown={(event) => {
          if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
        }}
        onContextMenu={(event) => event.preventDefault()}
        // Панель лежит в портале, но по дереву React это потомок пункта: без этого её клики переключали бы сам пункт.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={keys}
      >
        {sheet && (
          // Лист поверх листа: заголовок раздела и «Назад» к родительскому меню.
          <button type="button" data-inkbrick-part="sheet-back" onClick={onBack}>
            <Icon name="arrow-left" />
            <span>{item.title || t('contextMenu.label')}</span>
          </button>
        )}
        {item.submenu ? <MenuList items={item.submenu} onRun={onRun} /> : item.flyout}
      </div>
    </>
  );
}
