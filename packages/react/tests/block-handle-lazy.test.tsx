import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, waitFor } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.resetModules();
});

/**
 * Чистый граф модулей: чанк ручки блока ещё не загружен (в обычных тестах его заранее подгружает setup), а загрузка
 * считается по `lazyModule` этого же графа.
 */
async function fresh(props: Record<string, unknown> = {}) {
  vi.resetModules();

  const { mountEditor } = await import('./harness');
  const { useEditorView } = await import('../src/hooks/useEditorView');
  let view!: ReturnType<typeof useEditorView>;
  const Capture = () => {
    view = useEditorView();

    return null;
  };
  const mounted = mountEditor(['one', 'two'], { extra: <Capture />, ...props });

  return { ...mounted, view: () => view };
}

const gripOf = () => document.querySelector('[data-inkbrick-grip]');

describe('the block handle is a separate chunk', () => {
  it('typing works at once, and the handle appears when the chunk has come', async () => {
    const t = await fresh();

    // Ввод не ждёт чанка ручки.
    t.caret(t.ids[0], 3);
    t.type('!');
    expect(t.editor.engine.inline.toPlainText(t.editor.document.getBlock(t.ids[0])!.content)).toBe(
      'one!',
    );

    // Наведение до прихода чанка: ручки ещё нет, а когда чанк пришёл, она появляется по сохранённому наведению.
    act(() => t.view().blocks.setHover({ blockId: t.ids[1], x: 40, y: 80 }));
    expect(gripOf()).toBeNull();
    await waitFor(() => expect(gripOf()).not.toBeNull());
  });

  it('is not loaded for a read-only document and is loaded when editing starts', async () => {
    const t = await fresh();

    act(() => t.editor.setReadOnly(true));
    act(() => t.view().blocks.setHover({ blockId: t.ids[0], x: 40, y: 40 }));
    expect(gripOf()).toBeNull();

    act(() => t.editor.setReadOnly(false));
    act(() => t.view().blocks.setHover({ blockId: t.ids[0], x: 40, y: 40 }));
    await waitFor(() => expect(gripOf()).not.toBeNull());
  });

  it('a custom BlockHandle slot still works through the same layer', async () => {
    const Custom = ({ blockId }: { blockId: string }) => (
      <div data-testid="custom-handle" data-for={blockId} />
    );
    const t = await fresh({ slots: { BlockHandle: Custom } });

    act(() => t.view().blocks.setHover({ blockId: t.ids[1], x: 40, y: 80 }));
    await waitFor(() =>
      expect(document.querySelector('[data-testid="custom-handle"]')).toHaveProperty('dataset'),
    );
    expect(document.querySelector<HTMLElement>('[data-testid="custom-handle"]')!.dataset.for).toBe(
      t.ids[1],
    );
    expect(gripOf()).toBeNull();
  });
});
