import { useRef, useState, type CSSProperties } from 'react';

import { lazyModule, useLazy } from './lazy';

/**
 * Выбор цвета (`@inkbrick/color-picker` и его обёртка): отдельный чанк, грузится, когда «Свой цвет…» открывают (или
 * наводят на него).
 */
const colorPicker = lazyModule(() => import('./ColorPickerPanel'));

export interface CustomColorSwatchProps {
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
 * Образец «Свой цвет…». Кнопка раскрывает под палитрой выбор цвета с прозрачностью (квадрат, оттенок, прозрачность, поля
 * HEX / RGB / HSB); цвет применяется по «Применить» или Enter — одной правкой, — «Отмена» и Escape закрывают выбор и
 * возвращают фокус на кнопку. Выбор лежит внутри меню или панели, поэтому они не закрываются, пока им пользуются.
 */
export function CustomColorSwatch({
  value,
  fallback,
  label,
  pressed,
  role,
  action,
  alphaHex,
  onPick,
}: CustomColorSwatchProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <span data-inkbrick-part="custom-color">
        <button
          ref={button}
          type="button"
          role={role}
          aria-checked={role ? pressed : undefined}
          aria-expanded={open}
          data-inkbrick-part="swatch"
          data-color="custom"
          data-action={action}
          data-pressed={pressed || undefined}
          aria-label={label}
          title={label}
          style={value ? ({ '--inkbrick-custom-color': value } as CSSProperties) : undefined}
          onPointerEnter={() => void colorPicker.preload()}
          onClick={() => setOpen(!open)}
        />
      </span>
      {open && (
        <LazyPanel
          value={value ?? fallback}
          alphaHex={alphaHex}
          onApply={(hex) => {
            setOpen(false);
            onPick(hex);
          }}
          onCancel={close}
        />
      )}
    </>
  );
}

function LazyPanel(props: Parameters<typeof import('./ColorPickerPanel').ColorPickerPanel>[0]) {
  const loaded = useLazy(colorPicker);

  // Пока чанк грузится, место под выбором уже занято: палитра не прыгает.
  return loaded ? (
    <loaded.ColorPickerPanel {...props} />
  ) : (
    <div data-inkbrick-part="color-picker-panel" />
  );
}
