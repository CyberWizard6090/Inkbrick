import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, waitFor } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.resetModules();
});

/** Чистый граф модулей: чанк с разбором HTML ещё не загружен (в обычных тестах его заранее подгружает setup). */
async function freshEditor(texts: string[]) {
  vi.resetModules();

  const { mountEditor } = await import('./harness');

  return mountEditor(texts);
}

const text = (t: Awaited<ReturnType<typeof freshEditor>>, id: string) =>
  t.editor.engine.inline.toPlainText(t.editor.document.getBlock(id)!.content);

describe('pasting foreign HTML before the parser chunk is in', () => {
  it('waits for the chunk and inserts the parsed blocks at the same place', async () => {
    const t = await freshEditor(['one']);

    t.caret(t.ids[0], 3);
    t.clipboard('paste', {
      'text/plain': 'bold',
      'text/html': '<p>first <b>bold</b></p><p>second</p>',
    });

    // Чанка ещё нет: вставка не синхронная.
    expect(t.blocks().length).toBe(1);

    await waitFor(() => expect(t.blocks().length).toBe(2));

    expect(text(t, t.ids[0])).toBe('onefirst bold');
    expect(
      t.editor.engine.inline.toPlainText(t.editor.document.getBlock(t.blocks()[1])!.content),
    ).toBe('second');
    expect(
      t.editor.document.getBlock(t.ids[0])!.content.some((node) => node.attributes?.bold),
    ).toBe(true);
  });

  it('falls back to the plain text when the HTML gives nothing', async () => {
    const t = await freshEditor(['']);

    t.caret(t.ids[0], 0);
    t.clipboard('paste', { 'text/plain': 'just text', 'text/html': '<script></script>' });

    await waitFor(() => expect(text(t, t.ids[0])).toBe('just text'));
  });

  it('keeps the own format synchronous: no waiting for the chunk', async () => {
    const t = await freshEditor(['one']);
    const fragment = JSON.stringify({
      blocks: [
        { flavour: 'block:paragraph', props: {}, content: [{ insert: 'copied' }], children: [] },
      ],
    });

    t.caret(t.ids[0], 3);
    t.clipboard('paste', { 'text/plain': 'x', 'application/x-inkbrick-fragment': fragment });

    expect(text(t, t.ids[0])).toContain('copied');
  });
});
