import { useId, useLayoutEffect, useRef, useState } from 'react';

import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';
import type { SlashMenuProps } from './types';

const ESTIMATED_LINE = 28;

export function DefaultSlashMenu({
  items,
  activeIndex,
  position,
  onSelect,
  onHover,
}: SlashMenuProps) {
  const t = useT();
  const view = useEditorView();
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);
  const menuId = useId();
  const optionId = (index: number) => `${menuId}-option-${index}`;

  useLayoutEffect(() => {
    const menu = ref.current;

    if (!menu) return;

    setFlip(
      position.y + menu.offsetHeight > window.innerHeight &&
        position.y - menu.offsetHeight - ESTIMATED_LINE > 0,
    );
  }, [position.x, position.y, items.length]);

  useLayoutEffect(() => {
    ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, items]);

  /*
   * Фокус остаётся в тексте документа, а меню управляется с клавиатуры редактором (паттерн combobox ARIA):
   * корень документа ссылается на меню и на выбранный пункт — так экранный чтец озвучивает выбор.
   */
  useLayoutEffect(() => {
    const root = view.getRoot();

    if (!root) return;

    root.setAttribute('aria-controls', menuId);

    if (items.length > 0) root.setAttribute('aria-activedescendant', optionId(activeIndex));
    else root.removeAttribute('aria-activedescendant');

    return () => {
      root.removeAttribute('aria-controls');
      root.removeAttribute('aria-activedescendant');
    };
  }, [view, menuId, activeIndex, items.length]);

  return (
    <div
      ref={ref}
      id={menuId}
      className="inkbrick-slash-menu"
      data-inkbrick-ui="slash-menu"
      /*
       * Прокручиваемая область должна быть доступна с клавиатуры. До меню фокус Tab-ом не доходит: в открытом
       * меню Tab выбирает пункт (его перехватывает редактор), а клик по меню не уводит фокус из текста.
       */
      tabIndex={0}
      role="listbox"
      aria-label={t('slash.label')}
      data-testid="slash-menu"
      style={{
        left: Math.max(
          8,
          Math.min(position.x, window.innerWidth - (ref.current?.offsetWidth ?? 320) - 8),
        ),
        top: flip ? position.y - (ref.current?.offsetHeight ?? 0) - ESTIMATED_LINE : position.y + 4,
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.length === 0 && (
        <div className="inkbrick-slash-menu__description" data-inkbrick-part="empty">
          {t('slash.empty')}
        </div>
      )}

      {items.map((item, index) => (
        <div
          key={item.id}
          id={optionId(index)}
          role="option"
          aria-selected={index === activeIndex}
          data-slash-item={item.id}
          data-inkbrick-part="item"
          data-active={index === activeIndex || undefined}
          className={`inkbrick-slash-menu__item${index === activeIndex ? ' inkbrick-slash-menu__item--selected' : ''}`}
          onMouseEnter={() => onHover(index)}
          onClick={() => onSelect(item)}
        >
          {item.icon !== undefined && (
            <span className="inkbrick-slash-menu__icon" data-inkbrick-part="icon">
              {item.icon}
            </span>
          )}
          <div className="inkbrick-slash-menu__body" data-inkbrick-part="body">
            <div className="inkbrick-slash-menu__header" data-inkbrick-part="title">
              {item.title}
            </div>
            {item.description && (
              <div className="inkbrick-slash-menu__description" data-inkbrick-part="description">
                {item.description}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
