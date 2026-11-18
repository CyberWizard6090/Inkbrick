import { useEffect, useRef, type CSSProperties } from 'react';

import { isHexColor } from '@inkbrick/document';

export interface CustomColorSwatchProps {
  /** Текущий свой цвет (любой безопасный CSS-цвет) или `undefined`, если сейчас цвет не «свой». */
  readonly value: string | undefined;
  /** С какого цвета начинает системное окно выбора, когда своего цвета ещё нет. */
  readonly fallback: string;
  readonly label: string;
  readonly pressed: boolean;
  /** `menuitemradio` в меню блока; в панелях toolbar роли нет. */
  readonly role?: 'menuitemradio';
  readonly action?: string;
  /** Получает цвет вида `#rrggbb`, когда выбор в системном окне подтверждён. */
  readonly onPick: (hex: string) => void;
}

/**
 * Образец «Свой цвет…». Видимая и доступная с клавиатуры часть — кнопка: Enter или Space открывают системное окно
 * выбора, у которого свои стрелки. Сам `<input type="color">` скрыт и лежит над кнопкой (вложить его в кнопку нельзя); цвет применяется по `change`
 * (когда окно закрыто с выбором), а не по каждому движению ползунка, поэтому в историю попадает одна правка.
 */
export function CustomColorSwatch({
  value,
  fallback,
  label,
  pressed,
  role,
  action,
  onPick,
}: CustomColorSwatchProps) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const node = input.current;

    if (!node) return;

    const listener = () => {
      if (isHexColor(node.value)) onPick(node.value.toLowerCase());
    };

    node.addEventListener('change', listener);

    return () => node.removeEventListener('change', listener);
  }, [onPick]);

  const open = () => {
    const node = input.current;

    if (!node) return;

    try {
      node.showPicker();
    } catch {
      node.click();
    }
  };

  return (
    <span data-inkbrick-part="custom-color">
      <button
        type="button"
        role={role}
        aria-checked={role ? pressed : undefined}
        data-inkbrick-part="swatch"
        data-color="custom"
        data-action={action}
        data-pressed={pressed || undefined}
        aria-label={label}
        title={label}
        style={value ? ({ '--inkbrick-custom-color': value } as CSSProperties) : undefined}
        onClick={open}
      />
      <input
        ref={input}
        type="color"
        data-inkbrick-part="custom-color-input"
        defaultValue={isHexColor(value) ? value : fallback}
        tabIndex={-1}
        aria-hidden="true"
      />
    </span>
  );
}
