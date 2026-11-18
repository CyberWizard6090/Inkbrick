import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { useEditorView } from '../src/hooks/useEditorView';
import type { EditorView } from '../src/editing/EditorView';
import { mountEditor } from './harness';

beforeEach(() => {
  document.elementFromPoint = () => null;
});

afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
  cleanup();
});

let captured: EditorView | null = null;

function Capture() {
  captured = useEditorView();

  return null;
}

function mount(texts: string[] = ['hello']) {
  const mounted = mountEditor(texts, { extra: <Capture /> });
  const menu = () => document.querySelector<HTMLElement>('[data-testid="block-menu"]');
  const swatch = (color: string) =>
    menu()!.querySelector<HTMLElement>(`[data-action="background-${color}"]`)!;
  const openMenu = (index = 0) =>
    act(() => captured!.blocks.openMenu({ blockId: mounted.ids[index], x: 10, y: 10 }));
  const block = (index = 0) =>
    document.querySelector<HTMLElement>(`[data-block-id="${mounted.ids[index]}"]`)!;

  return { ...mounted, menu, swatch, openMenu, block };
}

describe('block background in the block menu', () => {
  it('offers a row of colours with the current one checked and "no background"', () => {
    const t = mount();

    t.openMenu();

    // «Без фона», 14 цветов палитры и «Свой цвет…».
    expect(t.menu()!.querySelectorAll('[data-inkbrick-part="swatch"]')).toHaveLength(16);
    expect(t.swatch('none').getAttribute('aria-checked')).toBe('true');
    expect(t.swatch('yellow').getAttribute('aria-label')).toBe('Yellow');

    for (const name of ['lime', 'teal', 'cyan', 'indigo', 'magenta'])
      expect(t.swatch(name).getAttribute('aria-label'), name).toBeTruthy();

    expect(t.swatch('teal').getAttribute('aria-label')).toBe('Teal');
    expect(t.swatch('custom').getAttribute('aria-label')).toBe('Custom color…');
  });

  it('"Custom color…" stores #rrggbb, draws it through a variable and checks the swatch', () => {
    const t = mount();

    t.openMenu();
    expect(t.swatch('custom').getAttribute('aria-checked')).toBe('false');

    const input = t.menu()!.querySelector<HTMLInputElement>('input[type="color"]')!;

    // Кнопка и скрытое поле — соседи: интерактивный элемент внутри кнопки недопустим.
    expect(input.closest('button')).toBeNull();
    expect(input.getAttribute('aria-hidden')).toBe('true');

    act(() => void fireEvent.change(input, { target: { value: '#12ab34' } }));

    expect(t.editor.document.getBlock(t.ids[0])!.props.background).toBe('#12ab34');
    expect(t.block().getAttribute('data-background')).toBe('custom');
    expect(t.block().style.getPropertyValue('--inkbrick-block-background')).toBe('#12ab34');
    expect(t.menu()).toBeNull();

    t.openMenu();
    expect(t.swatch('custom').getAttribute('aria-checked')).toBe('true');
    expect(t.swatch('none').getAttribute('aria-checked')).toBe('false');

    act(() => void fireEvent.click(t.swatch('none')));
    expect(t.block().hasAttribute('data-background')).toBe(false);
    expect(t.block().style.getPropertyValue('--inkbrick-block-background')).toBe('');
  });

  it('the engine refuses a background that is not a palette name or #rrggbb', () => {
    const t = mount();
    const can = (background: unknown) =>
      t.editor.can('setBlockProps', {
        blockId: t.ids[0],
        props: { background } as never,
      });

    expect(can('#12ab34')).toBe(true);
    expect(can('magenta')).toBe(true);

    for (const bad of ['url(x)', 'red; x', '#fff', '#12ab34;', 'rgb(1,2,3)', 'white', 'black'])
      expect(can(bad), bad).toBe(false);
  });

  it('a click sets the background, draws it on the block and closes the menu; "none" removes it', () => {
    const t = mount();

    t.openMenu();
    act(() => void fireEvent.click(t.swatch('green')));

    expect(t.editor.document.getBlock(t.ids[0])!.props.background).toBe('green');
    expect(t.block().getAttribute('data-background')).toBe('green');
    expect(t.menu()).toBeNull();

    t.openMenu();
    expect(t.swatch('green').getAttribute('aria-checked')).toBe('true');
    expect(t.swatch('none').getAttribute('aria-checked')).toBe('false');

    act(() => void fireEvent.click(t.swatch('none')));
    expect(t.block().hasAttribute('data-background')).toBe(false);
    expect(t.editor.document.getBlock(t.ids[0])!.props.background).toBeUndefined();
  });

  it('is one undo step and draws on headings, quotes and lists too', () => {
    const t = mount(['a']);

    act(() => {
      t.editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: t.ids[0], flavour: 'block:heading', props: { level: 1 } },
      });
    });
    t.editor.clearHistory();

    t.openMenu();
    act(() => void fireEvent.click(t.swatch('blue')));
    expect(t.block().getAttribute('data-background')).toBe('blue');

    act(() => t.editor.store.undo());
    expect(t.block().hasAttribute('data-background')).toBe(false);

    for (const flavour of ['block:quote', 'block:list']) {
      act(() => {
        t.editor.dispatch({
          type: 'convertBlock',
          payload: { blockId: t.ids[0], flavour, props: { background: 'pink' } },
        });
      });
      expect(t.block().getAttribute('data-background')).toBe('pink');
    }
  });

  it('has no row for a block that cannot have a background', () => {
    const t = mount(['a']);

    act(() => {
      t.editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: t.ids[0], flavour: 'block:code' },
      });
    });
    t.openMenu();

    expect(t.menu()!.querySelector('[data-inkbrick-part="swatches"]')).toBeNull();
  });
});
