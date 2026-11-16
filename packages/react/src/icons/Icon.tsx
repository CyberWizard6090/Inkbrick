import type { SVGProps } from 'react';

import { lazyModule, useLazy } from '../ui/lazy';
import { ICON_SHAPES, type IconName, type IconShape } from './lucide';

export type { IconName };

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  readonly name: IconName;
}

type Shapes = Readonly<Record<string, readonly IconShape[]>>;

const extraIcons = lazyModule(() =>
  import('./lucideExtra').then((module) => module.EXTRA_ICON_SHAPES as Shapes),
);

/** Загружает иконки, которых нет в основном бандле (редактор делает это сам при монтировании). */
export const preloadIcons = (): Promise<Shapes> => extraIcons.preload();

/**
 * Иконка из набора Lucide (ISC). Рисуется текущим цветом текста; размер задаётся CSS (`--inkbrick-icon-size`
 * или `width`/`height` у `[data-inkbrick-icon]`). Годится и для пользовательских пунктов slash-меню и меню блока.
 * Иконки не из основного набора подгружаются отдельным чанком: до этого рисуется пустая иконка того же размера.
 */
export function Icon({ name, ...props }: IconProps) {
  const own = (ICON_SHAPES as Shapes)[name];
  const extra = useLazy(extraIcons, own === undefined);
  const shapes = own ?? extra?.[name] ?? [];

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
