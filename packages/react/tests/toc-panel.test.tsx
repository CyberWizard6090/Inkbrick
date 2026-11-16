import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { TocPanel, type TocPanelProps } from '../src';
import { mountEditor } from './harness';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mountPanel(props: TocPanelProps = {}, texts = ['Intro', 'body', 'Part', 'Deep']) {
  const mounted = mountEditor(texts, { extra: <TocPanel {...props} /> });
  const { editor, ids } = mounted;

  act(() => {
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

  const panel = () => document.querySelector<HTMLElement>('[data-testid="toc-panel"]');
  const links = () => [...document.querySelectorAll<HTMLElement>('[data-inkbrick-part="link"]')];

  return { ...mounted, panel, links };
}

/** Раскладки в jsdom нет: верх каждого заголовка задаём сами. */
function stubTops(tops: Record<string, number>) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = tops[this.getAttribute('data-id') ?? ''] ?? 0;

    return {
      top,
      bottom: top + 20,
      left: 0,
      right: 0,
      width: 0,
      height: 20,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

const frame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

describe('table of contents panel', () => {
  it('lists the headings as links, nested by level, and follows the document', () => {
    const { panel, links, editor, ids } = mountPanel();

    expect(panel()!.getAttribute('data-side')).toBe('right');
    expect(links().map((link) => link.textContent)).toEqual(['Intro', 'Part', 'Deep']);

    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: ids[2], from: 4, to: 4, text: '!' },
      });
    });

    expect(links().map((link) => link.textContent)).toEqual(['Intro', 'Part!', 'Deep']);
  });

  it('the side and the deepest level are settings', () => {
    const { panel, links } = mountPanel({ side: 'left', maxLevel: 2 });

    expect(panel()!.getAttribute('data-side')).toBe('left');
    expect(links().map((link) => link.textContent)).toEqual(['Intro', 'Part']);
  });

  it('is not shown without headings', () => {
    mountEditor(['one', 'two'], { extra: <TocPanel /> });

    expect(document.querySelector('[data-testid="toc-panel"]')).toBeNull();
  });

  it('a click puts the caret into the heading', () => {
    const { links, ids } = mountPanel();

    fireEvent.click(links()[1]);

    const selection = getSelection()!;

    expect(selection.anchorNode?.parentElement?.closest('.editable')?.getAttribute('data-id')).toBe(
      ids[2],
    );
  });

  it('marks the section that is under the line while scrolling', async () => {
    const { ids, links } = mountPanel();

    // «Intro» и «Part» выше линии, «Deep» ниже: текущий — «Part».
    stubTops({ [ids[0]]: -400, [ids[2]]: 50, [ids[3]]: 500 });
    act(() => void window.dispatchEvent(new Event('scroll')));
    await frame();

    expect(links().map((link) => link.getAttribute('aria-current'))).toEqual([
      null,
      'location',
      null,
    ]);

    stubTops({ [ids[0]]: -900, [ids[2]]: -500, [ids[3]]: -10 });
    act(() => void window.dispatchEvent(new Event('scroll')));
    await frame();

    expect(links().map((link) => link.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'location',
    ]);
  });
});
