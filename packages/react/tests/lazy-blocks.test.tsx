import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { CodeBlockPlaceholder } from '../src/blocks/LazyCodeBlock';
import { FormulaBlockPlaceholder } from '../src/blocks/LazyFormulaBlock';
import { LazyCodeBlock } from '../src/blocks/LazyCodeBlock';
import { LazyFormulaBlock } from '../src/blocks/LazyFormulaBlock';
import { defaultBlockComponents } from '../src/registry/defaultBlockComponents';
import type { BlockViewProps } from '../src/ui/types';
import { mountEditor } from './harness';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetModules();
});

const viewProps = (flavour: string, text: string) =>
  ({
    block: {
      id: 'b1',
      flavour,
      parentId: 'n',
      children: [],
      props: {},
      content: text ? [{ insert: text }] : [],
    },
    selected: false,
    readOnly: false,
  }) as unknown as BlockViewProps;

describe('code and formula blocks load as separate chunks', () => {
  it('are registered through their lazy wrappers', () => {
    expect(defaultBlockComponents['block:code']).toBe(LazyCodeBlock);
    expect(defaultBlockComponents['block:formula']).toBe(LazyFormulaBlock);
  });

  it('the code placeholder shows the code as it is, with no editing', () => {
    const view = render(
      <CodeBlockPlaceholder {...viewProps('block:code', 'let a = 1;\nlet b = 2;')} />,
    );
    const element = view.container.firstElementChild!;

    expect(element.getAttribute('data-loading')).toBe('');
    expect(element.getAttribute('contenteditable')).toBe('false');
    expect(element.textContent).toBe('let a = 1;\nlet b = 2;');
  });

  it('the formula placeholder is an empty non-editable place with the same markup hooks', () => {
    const view = render(<FormulaBlockPlaceholder {...viewProps('block:formula', '')} />);
    const element = view.container.firstElementChild!;

    expect(element.getAttribute('data-inkbrick-block')).toBe('formula');
    expect(element.getAttribute('data-loading')).toBe('');
    expect(element.getAttribute('contenteditable')).toBe('false');
  });

  it('once the chunk is in, the real blocks are drawn and take input', () => {
    const { editor, ids, root } = mountEditor(['let a = 1;']);

    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: ids[0], flavour: 'block:code', props: {} },
    });

    expect(root.querySelector('[data-inkbrick-block="code"][data-loading]')).toBeNull();
    expect(root.querySelector('.editable[data-id]')?.getAttribute('data-id')).toBe(ids[0]);
  });
});

describe('preloading right after mount', () => {
  it('loads the chunks marked soon once, and not the others, and can be cancelled', async () => {
    vi.resetModules();
    vi.useFakeTimers();

    const lazy = await import('../src/ui/lazy');
    const soonLoader = vi.fn(() => Promise.resolve('soon'));
    const otherLoader = vi.fn(() => Promise.resolve('other'));

    lazy.lazyModule(soonLoader, { soon: true });
    lazy.lazyModule(otherLoader);

    const cancel = lazy.preloadSoon();

    cancel();
    await vi.runAllTimersAsync();
    expect(soonLoader).not.toHaveBeenCalled();

    lazy.preloadSoon();
    await vi.runAllTimersAsync();

    expect(soonLoader).toHaveBeenCalledTimes(1);
    expect(otherLoader).not.toHaveBeenCalled();
  });
});
