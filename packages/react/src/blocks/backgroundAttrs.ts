import type { CSSProperties } from 'react';

import { getBlockBackgroundColor, isHexColor } from '@inkbrick/document';

/**
 * Атрибуты фона блока. Имя из палитры отдаётся как `data-background="<имя>"` (оттенок задаёт тема), свой цвет — как
 * `data-background="custom"` и переменная `--inkbrick-block-background`. В `style` попадает только `#rrggbb`, прошедший
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
        'data-background': 'custom',
        style: { '--inkbrick-block-background': color } as CSSProperties,
      }
    : { 'data-background': color };
}
