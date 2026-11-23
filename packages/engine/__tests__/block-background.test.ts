import { describe, expect, it } from 'vitest';

import {
  toHtml,
  BLOCK_BACKGROUNDS,
  getBlockBackground,
  getBlockBackgroundColor,
} from '@inkbrick/document';

import { Editor } from '../src/internal';

function make(flavour = 'block:paragraph', props: Record<string, unknown> = {}) {
  const editor = new Editor();
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const first = editor.document.getBlock(note)!.children[0];

  editor.dispatch({
    type: 'replaceText',
    payload: { blockId: first, from: 0, to: 0, text: 'hello' },
  });

  if (flavour !== 'block:paragraph' || Object.keys(props).length > 0) {
    editor.dispatch({ type: 'convertBlock', payload: { blockId: first, flavour, props } });
  }

  editor.clearHistory();

  return { editor, id: first };
}

const set = (editor: Editor, id: string, background: unknown) =>
  editor.dispatch({
    type: 'setBlockProps',
    payload: { blockId: id, props: { background } },
  } as never);
const can = (editor: Editor, id: string, background: unknown) =>
  editor.can('setBlockProps', { blockId: id, props: { background } } as never);
const bg = (editor: Editor, id: string) => getBlockBackground(editor.document.getBlock(id)!);

describe('block background', () => {
  it('sets and removes a background in one undo step each', () => {
    const { editor, id } = make();

    set(editor, id, 'yellow');
    expect(bg(editor, id)).toBe('yellow');

    set(editor, id, undefined);
    expect(bg(editor, id)).toBeUndefined();
    expect('background' in editor.document.getBlock(id)!.props).toBe(false);

    editor.store.undo();
    expect(bg(editor, id)).toBe('yellow');
  });

  it('accepts only the palette and only blocks that have a background', () => {
    const { editor, id } = make();

    for (const color of BLOCK_BACKGROUNDS) expect(can(editor, id, color)).toBe(true);
    expect(can(editor, id, 'black')).toBe(false);
    expect(can(editor, id, 'url(x)')).toBe(false);
    // Своё значение — только `#rrggbb`: короткий hex, rgb() и хвост после цвета схема отвергает.
    for (const bad of ['#fff', 'rgb(1,2,3)', '#ff0000;x', '#ff00zz', 'red; x', ''])
      expect(can(editor, id, bad), bad).toBe(false);

    const divider = make('block:divider');
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];

    expect(can(editor, note, 'red')).toBe(false);
    expect(divider.editor.document.rootId).toBeTruthy();
  });

  it('accepts a custom #rrggbb background, undoes it and keeps it through conversion and HTML export', () => {
    const { editor, id } = make();

    expect(can(editor, id, '#12ab34')).toBe(true);
    expect(can(editor, id, '#12AB34')).toBe(true);

    set(editor, id, '#12ab34');
    expect(getBlockBackgroundColor(editor.document.getBlock(id)!)).toBe('#12ab34');
    // Именованный `getBlockBackground` своего цвета не знает: для имён из палитры он прежний.
    expect(bg(editor, id)).toBeUndefined();
    expect(toHtml(editor.document)).toContain('background-color:#12ab3459');

    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: id, flavour: 'block:heading', props: { level: 2 } },
    });
    expect(getBlockBackgroundColor(editor.document.getBlock(id)!)).toBe('#12ab34');

    editor.store.undo();
    editor.store.undo();
    expect(getBlockBackgroundColor(editor.document.getBlock(id)!)).toBeUndefined();
  });

  it('keeps the background when the block is turned into another text type', () => {
    const { editor, id } = make();

    set(editor, id, 'green');
    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: id, flavour: 'block:heading', props: { level: 2 } },
    });

    expect(editor.document.getBlock(id)!.flavour).toBe('block:heading');
    expect(bg(editor, id)).toBe('green');

    editor.dispatch({ type: 'convertBlock', payload: { blockId: id, flavour: 'block:quote' } });
    expect(bg(editor, id)).toBe('green');
  });

  it('does not break turning into a type without a background (code)', () => {
    const { editor, id } = make();

    set(editor, id, 'green');
    editor.dispatch({ type: 'convertBlock', payload: { blockId: id, flavour: 'block:code' } });

    expect(editor.document.getBlock(id)!.flavour).toBe('block:code');
    expect(bg(editor, id)).toBeUndefined();
  });

  it('a block created by Enter in a quote or list keeps the background, a paragraph after a heading does not', () => {
    const { editor, id } = make('block:quote');

    set(editor, id, 'blue');

    const result = editor.dispatch({
      type: 'splitBlock',
      payload: { blockId: id, offset: 5 },
    })!;

    expect(bg(editor, result.blockId)).toBe('blue');
  });

  it('is exported to HTML as an inline style with the light-theme shade', () => {
    const { editor, id } = make();

    set(editor, id, 'yellow');
    expect(toHtml(editor.document)).toContain('<p style="background-color:#ffe74a">hello</p>');

    set(editor, id, undefined);
    expect(toHtml(editor.document)).toContain('<p>hello</p>');
  });

  it('combines with the alignment in the same style attribute', () => {
    const { editor, id } = make('block:heading', { level: 1, align: 'center' });

    set(editor, id, 'pink');
    expect(toHtml(editor.document)).toMatch(
      /<h1 style="text-align:center;background-color:#ffb0e4">/,
    );
  });
});
