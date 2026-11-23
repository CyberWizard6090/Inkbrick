import type { CSSProperties } from 'react';

import { getBlockBackgroundColor, isHexColor } from '@inkbrick/document';

/**
 * Атрибуты фона блока. Имя из палитры отдаётся как `data-background="<имя>"` (оттенок задаёт тема), свой цвет — как
 * `data-background="custom"` (`"custom-alpha"` с прозрачностью) и переменная `--inkbrick-block-background`. В `style` попадает только `#rrggbb` / `#rrggbbaa`, прошедший
 * проверку схемы: ничего другого из документа туда не приходит.
 */
export function backgroundAttrs(block: { props: Readonly<Record<string, unknown>> }): {
  'data-background'?: string;
  style?: CSSProperties;
} {
  const color = getBlockBackgroundColor(block);

  if (color === undefined) return {};

  return isHexColor(color)
    ? {
        // `#rrggbbaa` (прозрачность выбрана) рисуется как есть, `#rrggbb` — разбавленным, чтобы текст читался.
        'data-background': color.length === 9 ? 'custom-alpha' : 'custom',
        style: { '--inkbrick-block-background': color } as CSSProperties,
      }
    : { 'data-background': color };
}
