import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import { mountEditor } from './harness';

afterEach(cleanup);

describe('typing (beforeinput)', () => {
  it('inserts text at the caret and replaces a selection', () => {
    const { ids, caret, select, type, outline } = mountEditor(['hello']);

    caret(ids[0], 5);
    type('!');
    expect(outline()).toEqual(['paragraph:hello!']);

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 5 });
    type('bye');
    expect(outline()).toEqual(['paragraph:bye!']);
  });

  it('Enter splits the block, Shift+Enter inserts a line break', () => {
    const { ids, caret, input, outline } = mountEditor(['abcd']);

    caret(ids[0], 2);
    input('insertParagraph');
    expect(outline()).toEqual(['paragraph:ab', 'paragraph:cd']);

    caret(ids[0], 1);
    input('insertLineBreak');
    expect(outline()).toEqual(['paragraph:a\nb', 'paragraph:cd']);
  });

  it('Backspace and Delete, by character, word and line', () => {
    const { ids, caret, input, outline } = mountEditor(['one two three']);

    caret(ids[0], 13);
    input('deleteContentBackward');
    expect(outline()).toEqual(['paragraph:one two thre']);

    input('deleteWordBackward');
    expect(outline()).toEqual(['paragraph:one two ']);

    caret(ids[0], 0);
    input('deleteContentForward');
    expect(outline()).toEqual(['paragraph:ne two ']);

    input('deleteWordForward');
    expect(outline()).toEqual(['paragraph: two ']);

    caret(ids[0], 4);
    input('deleteSoftLineForward');
    expect(outline()).toEqual(['paragraph: two']);

    input('deleteHardLineBackward');
    expect(outline()).toEqual(['paragraph:']);
  });

  it('Backspace at the start merges with the previous block; Delete at the end merges the next one', () => {
    const { ids, caret, input, outline } = mountEditor(['ab', 'cd', 'ef']);

    caret(ids[1], 0);
    input('deleteContentBackward');
    expect(outline()).toEqual(['paragraph:abcd', 'paragraph:ef']);

    caret(ids[0], 4);
    input('deleteContentForward');
    expect(outline()).toEqual(['paragraph:abcdef']);
  });

  it('a multi-block selection is deleted or replaced as one step', () => {
    const { editor, ids, select, type, input, outline } = mountEditor(['first', 'middle', 'last']);

    select({ blockId: ids[0], offset: 2 }, { blockId: ids[2], offset: 2 });
    type('X');
    expect(outline()).toEqual(['paragraph:fiXst']);

    act(() => {
      editor.undo();
    });
    expect(outline()).toEqual(['paragraph:first', 'paragraph:middle', 'paragraph:last']);

    select({ blockId: ids[0], offset: 5 }, { blockId: ids[1], offset: 0 });
    input('deleteByCut');
    expect(outline()).toEqual(['paragraph:firstmiddle', 'paragraph:last']);
  });

  it('Markdown shortcuts at the start of a paragraph convert the block', () => {
    const cases: Array<[string, string]> = [
      ['# ', 'heading'],
      ['- ', 'list'],
      ['1. ', 'list'],
      ['[] ', 'list'],
      ['> ', 'quote'],
      ['``` ', 'code'],
    ];

    for (const [shortcut, flavour] of cases) {
      const { ids, caret, type, outline, unmount } = mountEditor(['']);

      caret(ids[0], 0);
      type(shortcut);
      type('x');
      expect(outline(), shortcut).toEqual([`${flavour}:x`]);
      unmount();
    }
  });

  it('# … ###### at the start of a paragraph make headings of levels 1 to 6; seven # stay text', () => {
    for (let level = 1; level <= 6; level++) {
      const { editor, ids, caret, type, outline, unmount } = mountEditor(['']);

      caret(ids[0], 0);
      type(`${'#'.repeat(level)} `);
      type('x');

      expect(outline(), `level ${level}`).toEqual(['heading:x']);
      expect(editor.document.getBlock(ids[0])!.props.level).toBe(level);
      unmount();
    }

    const { ids, caret, type, outline } = mountEditor(['']);

    caret(ids[0], 0);
    type('####### x');
    expect(outline()).toEqual(['paragraph:####### x']);
  });

  it('a closing $ turns $code$ into an inline formula', () => {
    const { editor, ids, caret, type } = mountEditor(['']);

    caret(ids[0], 0);
    type('a $x^2$');

    expect(editor.document.getBlock(ids[0])!.content).toEqual([
      { insert: 'a ' },
      { insert: '￼', attributes: { formula: 'x^2' } },
    ]);
  });

  it('unknown and drop input types change nothing (the DOM never diverges from the model)', () => {
    const { ids, caret, input, outline } = mountEditor(['keep']);

    caret(ids[0], 2);
    const event = input('insertFromDrop', 'x');

    expect(event.defaultPrevented).toBe(true);
    expect(outline()).toEqual(['paragraph:keep']);
  });

  it('history and format input types (from the OS menu) work', () => {
    const { editor, ids, caret, select, type, input, outline } = mountEditor(['text']);

    caret(ids[0], 4);
    type('!');
    input('historyUndo');
    expect(outline()).toEqual(['paragraph:text']);
    input('historyRedo');
    expect(outline()).toEqual(['paragraph:text!']);

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 4 });
    input('formatBold');
    expect(editor.document.getBlock(ids[0])!.content[0]).toEqual({
      insert: 'text',
      attributes: { bold: true },
    });
  });
});

describe('keyboard (keymap)', () => {
  it('Backspace at the start and Delete at the end of a block work from keydown (Safari sends no beforeinput there)', () => {
    const { ids, caret, key, outline } = mountEditor(['ab', 'cd', 'ef']);

    caret(ids[1], 1);
    expect(key('Backspace').defaultPrevented).toBe(false); // внутри текста — обычный путь через beforeinput

    caret(ids[1], 0);
    expect(key('Backspace').defaultPrevented).toBe(true);
    expect(outline()).toEqual(['paragraph:abcd', 'paragraph:ef']);

    caret(ids[0], 4);
    expect(key('Delete').defaultPrevented).toBe(true);
    expect(outline()).toEqual(['paragraph:abcdef']);
  });

  it('keydown Backspace during IME composition is left to the keyboard', () => {
    const { ids, caret, root, outline } = mountEditor(['ab', 'cd']);

    caret(ids[1], 0);
    const event = new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });

    root.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(outline()).toEqual(['paragraph:ab', 'paragraph:cd']);
  });

  it('Ctrl+B / I / U toggle formats; Ctrl+Z / Ctrl+Y undo and redo', () => {
    const { editor, ids, select, key } = mountEditor(['word']);
    const attributes = () => editor.document.getBlock(ids[0])!.content[0].attributes;

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 4 });
    key('b', { ctrl: true });
    key('i', { ctrl: true });
    key('u', { ctrl: true });
    expect(attributes()).toEqual({ bold: true, italic: true, underline: true });

    key('z', { ctrl: true });
    expect(attributes()).toEqual({ bold: true, italic: true });

    key('y', { ctrl: true });
    expect(attributes()).toEqual({ bold: true, italic: true, underline: true });
  });

  it('alignment shortcuts change the block alignment', () => {
    const { editor, ids, caret, key } = mountEditor(['text']);

    caret(ids[0], 1);
    key('E', { ctrl: true, shift: true });

    expect(editor.document.getBlock(ids[0])!.props).toMatchObject({ alignment: 'center' });
  });

  it('Tab nests a list item and Shift+Tab lifts it; in code Tab inserts spaces', () => {
    const { editor, ids, caret, type, key, outline } = mountEditor(['', '']);

    caret(ids[0], 0);
    type('- a');
    caret(ids[1], 0);
    type('- b');
    key('Tab');

    const list = editor.document.getBlock(ids[0])!;
    expect(list.children).toEqual([ids[1]]);

    caret(ids[1], 0);
    key('Tab', { shift: true });
    expect(editor.document.getBlock(ids[0])!.children).toEqual([]);

    const code = mountEditor(['']);

    code.caret(code.ids[0], 0);
    code.type('``` ');
    code.key('Tab');
    expect(code.outline()).toEqual(['code:  ']);
    expect(outline()).toEqual(['list:a', 'list:b']);
  });

  it('Ctrl+A selects the whole document', () => {
    const { ids, caret, key } = mountEditor(['one', 'two']);

    caret(ids[0], 1);
    key('a', { ctrl: true });

    expect(getSelection()!.toString()).toContain('one');
    expect(getSelection()!.toString()).toContain('two');
  });
});

describe('clipboard', () => {
  it('copy writes plain text, HTML and the exact fragment; cut also deletes', () => {
    const { ids, select, clipboard, outline } = mountEditor(['alpha', 'beta']);

    select({ blockId: ids[0], offset: 1 }, { blockId: ids[1], offset: 2 });
    const copied = clipboard('copy');

    expect(copied['text/plain']).toBe('lpha\nbe');
    expect(copied['text/html']).toContain('data-inkbrick-fragment');
    expect(copied['application/x-inkbrick-fragment']).toBeTruthy();

    clipboard('cut');
    expect(outline()).toEqual(['paragraph:ata']);
  });

  it('pasting the copied fragment restores blocks and formatting', () => {
    const source = mountEditor(['Title', 'body']);

    source.select({ blockId: source.ids[0], offset: 0 }, { blockId: source.ids[0], offset: 5 });
    source.key('b', { ctrl: true });
    source.select({ blockId: source.ids[0], offset: 0 }, { blockId: source.ids[1], offset: 4 });
    const copied = source.clipboard('copy');
    source.unmount();

    const target = mountEditor(['']);

    target.caret(target.ids[0], 0);
    target.clipboard('paste', copied);

    expect(target.outline()).toEqual(['paragraph:Title', 'paragraph:body']);
    expect(target.editor.document.getBlock(target.blocks()[0])!.content[0].attributes).toEqual({
      bold: true,
    });
  });

  it('plain text: one block per line; into code — as is; a URL over a selection becomes a link', () => {
    const { editor, ids, caret, select, clipboard, outline } = mountEditor(['']);

    caret(ids[0], 0);
    clipboard('paste', { 'text/plain': 'one\ntwo\r\nthree' });
    expect(outline()).toEqual(['paragraph:one', 'paragraph:two', 'paragraph:three']);

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 3 });
    clipboard('paste', { 'text/plain': 'https://example.com' });
    expect(editor.document.getBlock(ids[0])!.content[0]).toEqual({
      insert: 'one',
      attributes: { link: 'https://example.com' },
    });

    const code = mountEditor(['']);

    code.caret(code.ids[0], 0);
    code.type('``` ');
    code.clipboard('paste', { 'text/plain': 'a\n\nb', 'text/html': '<p><b>a</b></p><p>b</p>' });
    expect(code.outline()).toEqual(['code:a\n\nb']);
  });

  it('HTML from other apps is parsed into blocks', () => {
    const { ids, caret, clipboard, outline } = mountEditor(['']);

    caret(ids[0], 0);
    clipboard('paste', {
      'text/html': '<h2>Head</h2><ul><li>item</li></ul>',
      'text/plain': 'Head item',
    });

    expect(outline()).toEqual(['heading:Head', 'list:item']);
  });

  it('Ctrl+Shift+V pastes as plain text', () => {
    const { ids, caret, key, clipboard, outline } = mountEditor(['']);

    caret(ids[0], 0);
    key('V', { ctrl: true, shift: true });
    clipboard('paste', { 'text/html': '<h1>Big</h1>', 'text/plain': 'Big' });

    expect(outline()).toEqual(['paragraph:Big']);
  });

  it('read-only: copy works, paste and cut change nothing', () => {
    const { ids, select, clipboard, outline } = mountEditor(['locked'], { readOnly: true });

    select({ blockId: ids[0], offset: 0 }, { blockId: ids[0], offset: 6 });
    expect(clipboard('copy')['text/plain']).toBe('locked');

    clipboard('cut');
    clipboard('paste', { 'text/plain': 'nope' });
    expect(outline()).toEqual(['paragraph:locked']);
  });
});
