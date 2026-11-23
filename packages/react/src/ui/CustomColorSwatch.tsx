import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { Icon } from '../icons/Icon';
import { lazyModule, useLazy } from './lazy';

/**
 * Выбор цвета (`@inkbrick/dom/color-picker` и его обёртка): отдельный чанк, грузится, когда «Свой цвет…» открывают (или
 * наводят на кнопку).
 */
const colorPicker = lazyModule(() => import('./ColorPickerPanel'));

/** Окно шире этого — выбор цвета отдельным окошком рядом с меню; уже (телефон, меню листом) — внутри, под палитрой. */
const POPOVER_MIN_VIEWPORT = 600;
const GAP = 8;
const EDGE = 8;

export interface CustomColorButtonProps {
  /** Текущий свой цвет (любой безопасный CSS-цвет) или `undefined`, если сейчас цвет не «свой». */
  readonly value: string | undefined;
  /** С какого цвета начинает выбор, когда своего цвета ещё нет. */
  readonly fallback: string;
  readonly label: string;
  readonly pressed: boolean;
  /** `menuitemradio` в меню блока; в панелях toolbar роли нет. */
  readonly role?: 'menuitemradio';
  readonly action?: string;
  /** `'always'` — результат всегда с прозрачностью (`#rrggbbaa`), даже непрозрачный; по умолчанию — только при < 100 %. */
  readonly alphaHex?: 'auto' | 'always';
  /** Получает `#rrggbb` или `#rrggbbaa`, когда выбор подтверждён («Применить» или Enter). */
  readonly onPick: (hex: string) => void;
}

/**
 * «+ Свой цвет…» под палитрой. Кнопка открывает выбор цвета с прозрачностью (квадрат, оттенок, прозрачность, поля
 * HEX / RGB / HSB) отдельным окошком рядом с меню или панелью; на узком экране — внутри, под палитрой. Цвет применяется
 * по «Применить» или Enter одной правкой; «Отмена», Escape и нажатие мимо окошка закрывают его, фокус возвращается на
 * кнопку. Окошко остаётся потомком меню в разметке (стоит по `position: fixed`), поэтому меню считают его своим и не
 * закрываются, пока им пользуются.
 */
export function CustomColorButton({
  value,
  fallback,
  label,
  pressed,
  role,
  action,
  alphaHex,
  onPick,
}: CustomColorButtonProps) {
  const [open, setOpen] = useState(false);
  const [floating, setFloating] = useState(true);
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  const close = (focus = true) => {
    setOpen(false);
    if (focus) button.current?.focus({ preventScroll: true });
  };

  const toggle = () => {
    setFloating(window.innerWidth >= POPOVER_MIN_VIEWPORT);
    setOpen(!open);
  };

  // Окошко рядом с меню: справа, если помещается, иначе слева, иначе под кнопкой; по вертикали — вровень с кнопкой.
  useLayoutEffect(() => {
    const node = popover.current;
    const anchor = button.current;

    if (!open || !floating || !node || !anchor) return;

    const place = () => {
      // Рядом и с панелью, где лежит палитра, и со всем элементом (меню, toolbar): панель toolbar висит над рядом
      // кнопок, и окошко не должно ложиться на них.
      const parts = [
        anchor.closest('[data-inkbrick-part="panel"], [data-inkbrick-part="flyout"]'),
        anchor.closest('[data-inkbrick-ui]'),
      ].flatMap((part) =>
        part ? [part.getBoundingClientRect()] : [anchor.getBoundingClientRect()],
      );
      const box = {
        left: Math.min(...parts.map((rect) => rect.left)),
        right: Math.max(...parts.map((rect) => rect.right)),
      };
      const own = anchor.getBoundingClientRect();
      const { width, height } = node.getBoundingClientRect();
      let left =
        box.right + GAP + width <= innerWidth - EDGE
          ? box.right + GAP
          : box.left - GAP - width >= EDGE
            ? box.left - GAP - width
            : own.left;
      let top =
        left === own.left ? own.bottom + GAP : Math.min(own.top, innerHeight - EDGE - height);

      left = Math.max(EDGE, Math.min(left, innerWidth - EDGE - width));
      top = Math.max(EDGE, Math.min(top, innerHeight - EDGE - height));

      node.style.left = `${left}px`;
      node.style.top = `${top}px`;

      // У предка может быть `transform` (плавающий toolbar стоит им): тогда `fixed` считается от него — поправляем.
      const actual = node.getBoundingClientRect();

      node.style.left = `${left + (left - actual.left)}px`;
      node.style.top = `${top + (top - actual.top)}px`;
    };

    place();

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;

    observer?.observe(node);
    window.addEventListener('resize', place);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [open, floating]);

  // Нажатие мимо окошка и кнопки закрывает его (меню при этом остаётся).
  useEffect(() => {
    if (!open || !floating) return;

    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (popover.current?.contains(target) || button.current?.contains(target)) return;

      close(false);
    };

    document.addEventListener('pointerdown', onDown, true);

    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, floating]);

  const picker = (
    <LazyPanel
      value={value ?? fallback}
      alphaHex={alphaHex}
      onApply={(hex) => {
        setOpen(false);
        onPick(hex);
      }}
      onCancel={() => close()}
    />
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        role={role === 'menuitemradio' ? 'menuitemradio' : undefined}
        aria-checked={role ? pressed : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-inkbrick-part="custom-color"
        data-color="custom"
        data-action={action}
        data-pressed={pressed || undefined}
        onPointerEnter={() => void colorPicker.preload()}
        onClick={toggle}
      >
        {value ? (
          <span
            data-inkbrick-part="custom-color-sample"
            aria-hidden="true"
            style={{ '--inkbrick-custom-color': value } as CSSProperties}
          />
        ) : (
          <Icon name="plus" />
        )}
        <span>{label}</span>
      </button>
      {open &&
        (floating ? (
          <div ref={popover} data-inkbrick-part="color-popover" role="dialog" aria-label={label}>
            {picker}
          </div>
        ) : (
          picker
        ))}
    </>
  );
}

function LazyPanel(props: Parameters<typeof import('./ColorPickerPanel').ColorPickerPanel>[0]) {
  const loaded = useLazy(colorPicker);

  // Пока чанк грузится, место под выбором уже занято: окошко не прыгает.
  return loaded ? (
    <loaded.ColorPickerPanel {...props} />
  ) : (
    <div data-inkbrick-part="color-picker-panel" />
  );
}
