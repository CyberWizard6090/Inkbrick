import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup } from '@testing-library/react';

import { mountEditor } from './harness';

afterEach(cleanup);

const HTML = '<p>hi</p><figure><img src="https://tracker.example/pixel.png" alt="x"></figure>';

function imageSources(editor: ReturnType<typeof mountEditor>['editor']): string[] {
  return Object.values(editor.document.dump())
    .filter((block) => block.flavour === 'block:image')
    .map((block) => String(block.props.src));
}

describe('images.rehost on paste', () => {
  it('without a hook, an external image is pasted by its own address', () => {
    const { editor, ids, caret, clipboard } = mountEditor(['']);

    caret(ids[0], 0);
    clipboard('paste', { 'text/html': HTML, 'text/plain': 'hi' });

    expect(imageSources(editor)).toEqual(['https://tracker.example/pixel.png']);
  });

  it('waits for the hook: no image block (and no request) before it answers, then pastes the new address', async () => {
    let answer!: (url: string | null) => void;
    const rehost = vi.fn(() => new Promise<string | null>((resolve) => (answer = resolve)));
    const { editor, ids, caret, clipboard } = mountEditor([''], { images: { rehost } });

    caret(ids[0], 0);
    clipboard('paste', { 'text/html': HTML, 'text/plain': 'hi' });
    await act(async () => {});

    expect(rehost).toHaveBeenCalledExactlyOnceWith('https://tracker.example/pixel.png');
    expect(imageSources(editor)).toEqual([]);

    await act(async () => answer('/uploads/pixel.png'));

    expect(imageSources(editor)).toEqual(['/uploads/pixel.png']);
  });

  it('drops the image when the hook returns null, an unsafe address or fails; the text stays', async () => {
    for (const rehost of [
      async () => null,
      async () => 'javascript:alert(1)',
      async () => {
        throw new Error('storage is down');
      },
    ]) {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { editor, ids, caret, clipboard, outline, unmount } = mountEditor([''], {
        images: { rehost },
      });

      caret(ids[0], 0);
      await act(async () => {
        clipboard('paste', { 'text/html': HTML, 'text/plain': 'hi' });
      });

      expect(imageSources(editor)).toEqual([]);
      expect(outline().join('|')).toContain('paragraph:hi');
      warn.mockRestore();
      unmount();
    }
  });

  it('does not touch fragments copied from the editor itself', () => {
    const rehost = vi.fn(async () => '/uploads/other.png');
    const { editor, ids, caret, clipboard } = mountEditor([''], { images: { rehost } });
    const fragment = JSON.stringify({
      blocks: [
        {
          flavour: 'block:image',
          props: { src: 'https://cdn.example/a.png' },
          content: [],
          children: [],
        },
      ],
    });

    caret(ids[0], 0);
    clipboard('paste', { 'application/x-inkbrick-fragment': fragment });

    expect(rehost).not.toHaveBeenCalled();
    expect(imageSources(editor)).toEqual(['https://cdn.example/a.png']);
  });
});
