import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { isHexColor } from '@inkbrick/document';

import { MenuSwitch, SheetBackdrop } from '../context-menu/DefaultContextMenu';
import { hideKeyboard, useSheet } from '../hooks/useSheet';
import { useT } from '../hooks/useT';
import type { MessageKey } from '../i18n/en';
import { Icon } from '../icons/Icon';
import { useGrowth } from '../hooks/useGrowth';
import { CustomColorSwatch } from '../ui/CustomColorSwatch';
import type { BlockMenuAction, BlockMenuProps } from './types';

export function DefaultBlockMenu({
  position,
  actions,
  turnInto,
  background,
  panels,
  onClose,
  onDismiss,
}: BlockMenuProps) {
  const t = useT();
  const { sheet, inset } = useSheet();

  // Лист на телефоне: экранная клавиатура прячется и не закрывает его.
  useLayoutEffect(() => {
    if (sheet) hideKeyboard();
  }, [sheet]);
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ flip: false, height: 0, width: 0 });
  const { flip, height, width } = fit;

  const entries: BlockMenuAction[] = [...actions, ...turnInto].filter((entry) => !entry.disabled);

  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')
      ?.focus();
  }, []);

  // Меню выросло (раскрылся выбор цвета): положение пересчитывается, чтобы меню не уходило за край окна.
  const grown = useGrowth(ref, !sheet);

  useLayoutEffect(() => {
    const menu = ref.current;

    // Лист снизу экрана положения не считает.
    if (!menu || sheet) return;

    // Ширина меню зависит от `left` (fixed-блок сжимается до места справа от него), а `left` — от ширины: без
    // фиксации меню менялось бы при каждой перерисовке (прокрутка внутри меню на телефоне). Мерим её один раз при
    // `left: 8` (там меню получает всё доступное место) и дальше держим.
    // React ведёт эти свойства сам: после замера возвращаем то, что было, а не пустое значение (иначе, если левый край
    // не изменится, React его не выставит снова, и меню окажется у левого края окна).
    const { left, width } = menu.style;

    menu.style.width = '';
    menu.style.left = '8px';

    const natural = menu.offsetWidth;

    menu.style.left = left;
    menu.style.width = width;
    setFit({
      flip:
        position.y + menu.offsetHeight > window.innerHeight && position.y - menu.offsetHeight > 0,
      height: menu.offsetHeight,
      width: natural,
    });
  }, [position.x, position.y, sheet, grown]);

  const move = (delta: number) => {
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        '[role^="menuitem"]:not([aria-disabled="true"])',
      ) ?? []),
    ];
    const index = items.indexOf(document.activeElement as HTMLElement);

    items[(index + delta + items.length) % items.length]?.focus();
  };

  const renderItem = (action: BlockMenuAction) => (
    <div
      key={action.id}
      role={action.toggle === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={action.toggle}
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
      {action.toggle !== undefined && <MenuSwitch on={action.toggle} />}
    </div>
  );

  return (
    <>
      {sheet && <SheetBackdrop onClose={onDismiss ?? onClose} />}
      <div
        ref={ref}
        className="inkbrick-block-menu"
        data-inkbrick-ui="block-menu"
        // С какой стороны от ручки открыто меню: от этого зависит, откуда оно выезжает при появлении.
        data-side={flip ? 'top' : 'bottom'}
        data-sheet={sheet || undefined}
        role="menu"
        aria-label={t('menu.label')}
        data-testid="block-menu"
        data-inkbrick-block-ui
        style={
          sheet
            ? { bottom: inset }
            : {
                left: Math.max(8, Math.min(position.x, window.innerWidth - (width || 232) - 8)),
                width: width || undefined,
                // Снизу от ручки не помещается, а сверху тоже: меню сдвигается вверх, чтобы целиком остаться в окне.
                top: flip
                  ? Math.max(8, position.y - height - 32)
                  : Math.max(8, Math.min(position.y, window.innerHeight - height - 8)),
                maxHeight: `min(60vh, ${window.innerHeight - 16}px)`,
              }
        }
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
        {actions.map((action, index) => (
          <Fragment key={action.id}>
            {action.group && action.group !== actions[index - 1]?.group && (
              <div data-inkbrick-part="label" role="separator">
                {action.group}
              </div>
            )}
            {renderItem(action)}
          </Fragment>
        ))}

        {turnInto.length > 0 && (
          <>
            <div className="inkbrick-block-menu__label" data-inkbrick-part="label" role="separator">
              {t('menu.turnInto')}
            </div>
            {turnInto.map(renderItem)}
          </>
        )}

        {background && (
          <>
            <div className="inkbrick-block-menu__label" data-inkbrick-part="label" role="separator">
              {t('menu.background')}
            </div>
            <div data-inkbrick-part="swatches" role="group" aria-label={t('menu.background')}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={background.current === undefined}
                data-inkbrick-part="swatch"
                data-color=""
                data-action="background-none"
                aria-label={t('menu.background.none')}
                title={t('menu.background.none')}
                onClick={() => background.onPick(null)}
              >
                <Icon name="x" />
              </button>
              {background.options.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="menuitemradio"
                  aria-checked={background.current === color}
                  data-inkbrick-part="swatch"
                  data-color={color}
                  data-action={`background-${color}`}
                  aria-label={t(`color.${color}` as MessageKey)}
                  title={t(`color.${color}` as MessageKey)}
                  onClick={() => background.onPick(color)}
                />
              ))}
              <CustomColorSwatch
                role="menuitemradio"
                action="background-custom"
                // Фон из выбора — с прозрачностью всегда: он рисуется ровно таким, как выбран.
                alphaHex="always"
                value={isHexColor(background.current) ? background.current : undefined}
                // Фон начинается с 35 % (как заготовленные оттенки): текст на нём читается.
                fallback="#94c8ff59"
                label={t('color.custom')}
                pressed={isHexColor(background.current)}
                onPick={background.onPick}
              />
            </div>
          </>
        )}

        {panels?.map((panel) => (
          <Fragment key={panel.id}>
            <div className="inkbrick-block-menu__label" data-inkbrick-part="label" role="separator">
              {panel.title}
            </div>
            {panel.content}
          </Fragment>
        ))}

        {entries.length === 0 && (
          <div className="inkbrick-block-menu__label" data-inkbrick-part="label">
            {t('menu.empty')}
          </div>
        )}
      </div>
    </>
  );
}
