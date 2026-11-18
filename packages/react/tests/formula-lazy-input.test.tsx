import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.resetModules();
});

/** Чистый граф модулей: чанк блока формулы ещё не загружен (в обычных тестах его заранее подгружает setup). */
async function freshEditor() {
  vi.resetModules();

  const { mountEditor } = await import('./harness');

  return mountEditor(['']);
}

const field = (root: HTMLElement) =>
  root.querySelector<HTMLTextAreaElement>('[data-inkbrick-part="formula-source"]');

const part = (root: HTMLElement, name: string) =>
  root.querySelector(`[data-inkbrick-part="${name}"]`);

describe('a formula block whose chunk has not come yet', () => {
  it('is already an open field that takes the focus and the typed code', async () => {
    const { editor, ids, root } = await freshEditor();

    act(() => {
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[0], flavour: 'block:formula', props: {} },
      });
    });

    // Чанк ещё не пришёл: блок уже принимает ввод.
    const before = field(root);

    expect(before).not.toBeNull();
    expect(document.activeElement).toBe(before);

    fireEvent.change(before!, { target: { value: 'x^2' } });
    expect(before!.value).toBe('x^2');

    // Чанк пришёл: тот же элемент, текст и фокус на месте, добавилась палитра.
    await waitFor(() => expect(part(root, 'formula-palette')).not.toBeNull());

    expect(field(root)).toBe(before);
    expect(before!.value).toBe('x^2');
    expect(document.activeElement).toBe(before);

    fireEvent.change(before!, { target: { value: 'x^23' } });
    expect(before!.value).toBe('x^23');
  });

  it('shows the code of a filled formula as text and opens the field on a click', async () => {
    const { editor, ids, root } = await freshEditor();

    act(() => {
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[0], flavour: 'block:formula', props: { latex: 'a+b' } },
      });
    });

    const display = part(root, 'formula-display')!;

    expect(display.textContent).toContain('a+b');

    fireEvent.click(display);

    const input = field(root)!;

    expect(input.value).toBe('a+b');
    expect(document.activeElement).toBe(input);

    await waitFor(() => expect(part(root, 'formula-palette')).not.toBeNull());
    expect(field(root)).toBe(input);
  });
});
