import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { htmlToFragment } from '../src/html';

/** Разбор HTML буфера обмена вне браузера: в Node нет `DOMParser`, парсер передаётся. */
describe('htmlToFragment in Node', () => {
  it('parses with a parser passed in and refuses clearly without one', () => {
    const { DOMParser } = new JSDOM('').window;
    const fragment = htmlToFragment('<h2>Title</h2><p>Some <b>bold</b> text</p>', {
      parser: new DOMParser(),
    });

    expect(fragment?.blocks.map((block) => block.flavour)).toEqual([
      'block:heading',
      'block:paragraph',
    ]);
    expect(fragment?.blocks[1].content).toContainEqual({
      insert: 'bold',
      attributes: { bold: true },
    });
    expect(() => htmlToFragment('<p>x</p>')).toThrow(/DOMParser/);
  });
});
