import { describe, expect, it } from 'vitest';

import { EXTRA_ICON_NAMES, ICON_SHAPES } from '../src/icons/lucide';
import { EXTRA_ICON_SHAPES } from '../src/icons/lucideExtra';

const REQUIRED: Record<string, string[]> = {
  path: ['d'],
  line: ['x1', 'y1', 'x2', 'y2'],
  circle: ['cx', 'cy', 'r'],
  rect: ['width', 'height'],
  polyline: ['points'],
  polygon: ['points'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
};

describe('иконки Lucide', () => {
  it('у каждой фигуры есть атрибуты, без которых она не рисуется', () => {
    for (const [name, shapes] of Object.entries({ ...ICON_SHAPES, ...EXTRA_ICON_SHAPES })) {
      for (const [tag, attributes] of shapes) {
        for (const attribute of REQUIRED[tag] ?? []) {
          expect(attributes, `${name}: <${tag}> без «${attribute}»`).toHaveProperty(attribute);
        }
      }
    }
  });

  it('names of the separate chunk match it, and no icon is in both sets', () => {
    expect([...EXTRA_ICON_NAMES].sort()).toEqual(Object.keys(EXTRA_ICON_SHAPES).sort());
    expect(Object.keys(ICON_SHAPES).filter((name) => name in EXTRA_ICON_SHAPES)).toEqual([]);
  });
});
