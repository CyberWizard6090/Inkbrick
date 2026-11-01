import { describe, expect, it } from 'vitest';

import { ICON_SHAPES } from '../src/icons/lucide';

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
    for (const [name, shapes] of Object.entries(ICON_SHAPES)) {
      for (const [tag, attributes] of shapes) {
        for (const attribute of REQUIRED[tag] ?? []) {
          expect(attributes, `${name}: <${tag}> без «${attribute}»`).toHaveProperty(attribute);
        }
      }
    }
  });
});
