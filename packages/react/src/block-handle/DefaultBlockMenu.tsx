import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useT } from '../hooks/useT';
import type { BlockMenuAction, BlockMenuProps } from './types';

export function DefaultBlockMenu({ position, actions, turnInto, onClose }: BlockMenuProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);

  const entries: BlockMenuAction[] = [...actions, ...turnInto].filter((entry) => !entry.disabled);

  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
      ?.focus();
  }, []);

  useLayoutEffect(() => {
    const menu = ref.current;

    if (menu)
      setFlip(
        position.y + menu.offsetHeight > window.innerHeight && position.y - menu.offsetHeight > 0,
      );
  }, [position.y]);

  const move = (delta: number) => {
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? []),
    ];
    const index = items.indexOf(document.activeElement as HTMLElement);

    items[(index + delta + items.length) % items.length]?.focus();
  };

  const renderItem = (action: BlockMenuAction) => (
    <div
      key={action.id}
      role="menuitem"
      tabIndex={action.disabled ? -1 : 0}
      aria-disabled={action.disabled || undefined}
      data-action={action.id}
      data-inkbrick-part="item"
      data-disabled={action.disabled || undefined}
      data-danger={action.danger || undefined}
      className={`inkbrick-block-menu__item${action.danger ? ' inkbrick-block-menu__item--danger' : ''}`}
      onClick={() => !action.disabled && action.run()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!action.disabled) action.run();
        }
      }}
    >
      {action.icon !== undefined && (
        <span className="inkbrick-block-menu__icon" data-inkbrick-part="icon">
          {action.icon}
        </span>
      )}
      {action.title}
    </div>
  );

  return (
    <div
      ref={ref}
      className="inkbrick-block-menu"
      data-inkbrick-ui="block-menu"
      role="menu"
      aria-label={t('menu.label')}
      data-testid="block-menu"
      data-inkbrick-block-ui
      style={{
        left: Math.max(
          8,
          Math.min(position.x, window.innerWidth - (ref.current?.offsetWidth ?? 232) - 8),
        ),
        top: flip ? Math.max(8, position.y - (ref.current?.offsetHeight ?? 0) - 32) : position.y,
      }}
      onKeyDown={(event) => {
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
      {actions.map(renderItem)}

      {turnInto.length > 0 && (
        <>
          <div className="inkbrick-block-menu__label" data-inkbrick-part="label" role="separator">
            {t('menu.turnInto')}
          </div>
          {turnInto.map(renderItem)}
        </>
      )}

      {entries.length === 0 && (
        <div className="inkbrick-block-menu__label" data-inkbrick-part="label">
          {t('menu.empty')}
        </div>
      )}
    </div>
  );
}
