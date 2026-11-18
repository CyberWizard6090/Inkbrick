import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';

import { CodeCaption, CodeToolbar } from '../src/blocks/CodeBlock';
import { CodeShell } from '../src/blocks/CodeShell';
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

  describe('a code block whose chunk has not come yet', () => {
    let setReady: (ready: boolean) => void = () => undefined;

    /** Каркас блока кода с панелью, которая «приходит» по команде: так же, как приходит чанк. */
    function Swapping(props: BlockViewProps) {
      const [ready, set] = useState(false);

      setReady = set;

      return (
        <CodeShell
          {...props}
          Toolbar={ready ? CodeToolbar : null}
          Caption={ready ? CodeCaption : null}
        />
      );
    }

    const mountCode = (text: string) => {
      const mounted = mountEditor([text], {
        components: { 'block:code': Swapping as never },
      });

      act(() => {
        mounted.editor.dispatch({
          type: 'convertBlock',
          payload: { blockId: mounted.ids[0], flavour: 'block:code', props: {} },
        });
      });

      return mounted;
    };

    it('already shows the code in an editable body and keeps a place for the toolbar', () => {
      const { root, ids } = mountCode('let a = 1;');
      const block = root.querySelector('[data-inkbrick-block="code"]')!;

      expect(
        block.querySelector('[data-inkbrick-part="toolbar"]')!.hasAttribute('data-loading'),
      ).toBe(true);
      expect(block.querySelector('[data-inkbrick-part="collapse"]')).toBeNull();
      expect(block.querySelector(`.editable[data-id="${ids[0]}"]`)!.textContent).toBe('let a = 1;');
    });

    it('takes input before the chunk arrives and keeps it after', () => {
      const { root, ids, caret, type, editor } = mountCode('ab');

      caret(ids[0], 2);
      type('c');
      expect(editor.engine.inline.toPlainText(editor.document.getBlock(ids[0])!.content)).toBe(
        'abc',
      );

      act(() => setReady(true));

      expect(root.querySelector('[data-inkbrick-part="collapse"]')).not.toBeNull();
      expect(
        root.querySelector('[data-inkbrick-part="toolbar"]')!.hasAttribute('data-loading'),
      ).toBe(false);

      type('d');
      expect(editor.engine.inline.toPlainText(editor.document.getBlock(ids[0])!.content)).toBe(
        'abcd',
      );
    });

    it('keeps the same input element when the toolbar arrives, so the caret is not lost', () => {
      const { root, ids, caret } = mountCode('ab');
      const before = root.querySelector(`.editable[data-id="${ids[0]}"]`);

      caret(ids[0], 1);
      act(() => setReady(true));

      expect(root.querySelector(`.editable[data-id="${ids[0]}"]`)).toBe(before);
      expect(before!.contains(getSelection()!.anchorNode)).toBe(true);
    });
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
