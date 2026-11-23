import { useEffect, useRef } from 'react';

import { createColorPicker } from '@inkbrick/dom/color-picker';

import { useT } from '../hooks/useT';

/** Выбор цвета из `@inkbrick/dom/color-picker` с надписями на языке редактора (отдельный чанк, см. `CustomColorSwatch`). */
export function ColorPickerPanel({
  value,
  alphaHex,
  onApply,
  onCancel,
}: {
  readonly value: string;
  readonly alphaHex?: 'auto' | 'always';
  onApply(hex: string): void;
  onCancel(): void;
}) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onApply, onCancel });

  handlers.current = { onApply, onCancel };

  useEffect(() => {
    const node = host.current;

    if (!node) return;

    const handle = createColorPicker({
      value,
      alphaHex,
      actions: true,
      labels: {
        picker: t('color.picker'),
        area: t('color.picker.area'),
        hue: t('color.picker.hue'),
        alpha: t('color.picker.alpha'),
        format: t('color.picker.format'),
        red: t('color.red'),
        green: t('color.green'),
        blue: t('color.blue'),
        saturation: t('color.picker.saturation'),
        brightness: t('color.picker.brightness'),
        cancel: t('formula.cancel'),
        apply: t('formula.apply'),
      },
      onApply: (hex) => handlers.current.onApply(hex),
      onCancel: () => handlers.current.onCancel(),
    });

    node.append(handle.element);
    // В меню с прокруткой выбор может оказаться ниже видимой части: показываем его целиком.
    node.scrollIntoView?.({ block: 'nearest' });
    handle.element.querySelector<HTMLElement>('[data-inkbrick-part="color-area"]')?.focus({
      preventScroll: true,
    });

    return () => handle.destroy();
    // Цвет и надписи берутся на момент открытия.
  }, []);

  // Клавиши выбора (ввод в поля, Enter, Escape) не уходят в меню и в документ вокруг.
  return (
    <div
      ref={host}
      data-inkbrick-part="color-picker-panel"
      onKeyDown={(event) => event.stopPropagation()}
    />
  );
}
