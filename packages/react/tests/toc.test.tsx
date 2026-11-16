import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import type { CaretResult } from '@inkbrick/engine';

import { tocBlocks } from '../src';
import { mountEditor } from './harness';

afterEach(cleanup);

function mountToc(texts: string[] = ['Intro', 'body', 'Part', 'Deep'], readOnly = false) {
  const mounted = mountEditor(texts, { blocks: tocBlocks, readOnly });
  const { editor, ids } = mounted;

  act(() => {
    editor.setReadOnly(false);
    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: ids[0], flavour: 'block:heading', props: { level: 1 } },
    });
    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: ids[2], flavour: 'block:heading', props: { level: 2 } },
    });
    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: ids[3], flavour: 'block:heading', props: { level: 3 } },
    });
  });

  let tocId = '';

  act(() => {
    const caret = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:toc', afterId: ids[3] },
    }) as CaretResult | undefined;

    tocId = caret?.blockId ?? '';
  });

  if (readOnly) act(() => editor.setReadOnly(true));

  const toc = () => mounted.root.querySelector<HTMLElement>('[data-inkbrick-block="toc"]')!;
  const links = () => [...toc().querySelectorAll<HTMLElement>('[data-inkbrick-part="link"]')];

  return { ...mounted, tocId, toc, links };
}

describe('table of contents', () => {
  it('lists the headings as nested links', () => {
    const { toc, links } = mountToc();

    expect(toc().getAttribute('aria-label')).toBe('Table of contents');
    expect(links().map((link) => link.textContent)).toEqual(['Intro', 'Part', 'Deep']);
    expect(
      [...toc().querySelectorAll('li')].map(
        (item) => (item as HTMLElement).style.marginInlineStart,
      ),
    ).toEqual(['0px', '16px', '32px']);
  });

  it('follows the document: new headings, renamed headings, removed headings', () => {
    const { editor, ids, links } = mountToc();

    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: ids[0], from: 5, to: 5, text: '!' },
      });
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[1], flavour: 'block:heading', props: { level: 2 } },
      });
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[3], flavour: 'block:paragraph' },
      });
    });

    expect(links().map((link) => link.textContent)).toEqual(['Intro!', 'body', 'Part']);
  });

  it('the level button limits the headings and cycles back to all', () => {
    const { toc, links } = mountToc();
    const button = () => toc().querySelector<HTMLElement>('[data-inkbrick-part="levels"]')!;

    expect(button().textContent).toBe('H1–H6');

    fireEvent.click(button());
    expect(button().textContent).toBe('H1');
    expect(links().map((link) => link.textContent)).toEqual(['Intro']);

    fireEvent.click(button());
    fireEvent.click(button());
    expect(button().textContent).toBe('H1–H3');
    expect(links()).toHaveLength(3);
  });

  it('a link puts the caret into its heading', () => {
    const { links, root, editable, ids } = mountToc();

    root.focus();
    act(() => {
      fireEvent.click(links()[1]);
    });

    const selection = document.getSelection()!;

    expect(editable(ids[2]).contains(selection.anchorNode)).toBe(true);
  });

  it('says what it is for while there are no headings, and has no level button when read-only', () => {
    const empty = mountToc(['a', 'b', 'c', 'd']);

    act(() => {
      for (const id of empty.ids.slice(0, 4)) {
        empty.editor.dispatch({
          type: 'convertBlock',
          payload: { blockId: id, flavour: 'block:paragraph' },
        });
      }
    });
    expect(empty.toc().querySelector('[data-inkbrick-part="empty"]')?.textContent).toBe(
      'Headings of the document will appear here',
    );
    cleanup();

    const readOnly = mountToc(undefined, true);

    expect(readOnly.toc().querySelector('[data-inkbrick-part="levels"]')).toBeNull();
    expect(readOnly.links()).toHaveLength(3);
  });
});
