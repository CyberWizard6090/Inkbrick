import type { SVGProps } from 'react';

import { ICON_SHAPES, type IconName } from './lucide';

export type { IconName };

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  readonly name: IconName;
}

/**
 * Иконка из набора Lucide (ISC). Рисуется текущим цветом текста; размер задаётся CSS (`--inkbrick-icon-size`
 * или `width`/`height` у `[data-inkbrick-icon]`). Годится и для пользовательских пунктов slash-меню и меню блока.
 */
export function Icon({ name, ...props }: IconProps) {
  const shapes = ICON_SHAPES[name];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-inkbrick-icon={name}
      {...props}
    >
      {shapes.map(([tag, attributes], index) => {
        const Shape = tag as 'path';

        return <Shape key={index} {...attributes} />;
      })}
    </svg>
  );
}
