import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useT } from '../hooks/useT';
import type { ContextMenuItem, ContextMenuProps } from './types';

const MARGIN = 8;

export function DefaultContextMenu({ position, formatting, items, onClose }: ContextMenuProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: position.x, top: position.y });
  // Меню открылось над точкой клика: при появлении оно выезжает снизу.
  const [above, setAbove] = useState(false);

  // Меню целиком в окне: у правого/нижнего края открывается влево/вверх от точки клика.
  useLayoutEffect(() => {
    const menu = ref.current;

    if (!menu) return;

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
  }, [position.x, position.y, formatting !== null]);

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
    <div
      ref={ref}
      className="inkbrick-context-menu"
      data-inkbrick-ui="context-menu"
      data-testid="context-menu"
      data-side={above ? 'top' : 'bottom'}
      role="menu"
      aria-label={t('contextMenu.label')}
      style={place}
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
            <div
              role="menuitem"
              tabIndex={item.disabled ? -1 : 0}
              aria-disabled={item.disabled || undefined}
              data-action={item.id}
              data-inkbrick-part="item"
              data-disabled={item.disabled || undefined}
              className="inkbrick-context-menu__item"
              onClick={() => run(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  run(item);
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
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}
