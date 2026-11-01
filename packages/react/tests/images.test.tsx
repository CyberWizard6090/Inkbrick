// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { Editor, type CaretResult } from '@inkbrick/engine';

import { DocumentView, EditorProvider, normalizeImageUrl, uploadImage } from '../src';
import { UploadTracker } from '../src/images/UploadTracker';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function editorWith(flavour: string, props: Record<string, unknown>, readOnly = false) {
  const editor = new Editor();
  const note = editor.document.getBlock(editor.document.rootId)!.children[0];
  const first = editor.document.getBlock(note)!.children[0];

  editor.dispatch({
    type: 'insertBlock',
    payload: { flavour, afterId: first, props: props as never },
  });
  editor.setReadOnly(readOnly);

  return editor;
}

const render = (editor: Editor) =>
  renderToString(
    <EditorProvider editor={editor}>
      <DocumentView />
    </EditorProvider>,
  );

describe('normalizeImageUrl', () => {
  it('adds https:// to bare domains and keeps safe absolute, relative and data URLs', () => {
    expect(normalizeImageUrl(' example.com/a.png ')).toBe('https://example.com/a.png');
    expect(normalizeImageUrl('http://x.test/a.jpg')).toBe('http://x.test/a.jpg');
    expect(normalizeImageUrl('/uploads/a.webp')).toBe('/uploads/a.webp');
    expect(normalizeImageUrl(PNG)).toBe(PNG);
  });

  it('rejects empty and unsafe input', () => {
    for (const input of [
      '',
      '  ',
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:text/html;base64,PGI+',
      '//evil.test/a.png',
      'ftp://x/a.png',
    ]) {
      expect(normalizeImageUrl(input)).toBeNull();
    }
  });
});

describe('uploadImage', () => {
  const file = (type: string, size = 10) => ({ type, size, name: 'a' }) as unknown as File;

  it('uses the custom uploader and validates what it returns', async () => {
    expect(
      await uploadImage(file('image/png'), { upload: async () => 'https://cdn.test/a.png' }),
    ).toBe('https://cdn.test/a.png');
    await expect(
      uploadImage(file('image/png'), { upload: async () => 'javascript:alert(1)' }),
    ).rejects.toThrow('unsupported image address');
  });

  it('rejects unsupported types and files over the inline limit when no uploader is given', async () => {
    await expect(uploadImage(file('image/svg+xml'), {})).rejects.toThrow('Unsupported image type');
    await expect(uploadImage(file('application/pdf'), {})).rejects.toThrow(
      'Unsupported image type',
    );
    await expect(uploadImage(file('image/png', 5_000), { maxInlineBytes: 1_000 })).rejects.toThrow(
      'larger than',
    );
    await expect(uploadImage(file('image/png'), { acceptedTypes: ['image/jpeg'] })).rejects.toThrow(
      'Unsupported image type',
    );
  });
});

describe('UploadTracker', () => {
  it('tracks uploads and errors per block and notifies subscribers', () => {
    const tracker = new UploadTracker();
    let calls = 0;
    tracker.subscribe(() => calls++);

    tracker.start('a');
    expect(tracker.has('a')).toBe(true);
    tracker.finish('a', 'boom');
    expect(tracker.has('a')).toBe(false);
    expect(tracker.errorOf('a')).toBe('boom');

    tracker.start('a'); // новая попытка сбрасывает ошибку
    expect(tracker.errorOf('a')).toBeUndefined();
    tracker.finish('a');
    tracker.clearError('a');

    expect(calls).toBeGreaterThan(3);
    expect(tracker.errorOf('zzz')).toBeUndefined();
  });
});

describe('rendering', () => {
  it('an image block renders a safe <img> with alt, lazy loading and no referrer', () => {
    const html = render(
      editorWith('block:image', {
        src: PNG,
        alt: 'tiny "pic"',
        caption: 'Cap',
        width: 50,
        align: 'right',
      }),
    );

    expect(html).toContain('<img');
    expect(html).toContain('loading="lazy"');
    expect(html.toLowerCase()).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('alt="tiny &quot;pic&quot;"');
    expect(html).toContain('width:50%');
    expect(html).toContain('data-align="right"');
  });

  it('an empty image shows the picker; in read-only mode it shows a placeholder and no controls', () => {
    expect(render(editorWith('block:image', {}))).toContain('image-picker');

    const html = render(editorWith('block:image', {}, true));
    expect(html).not.toContain('image-picker');
    expect(html).toContain('No image');
  });

  it('read-only images have no tools or inputs, only a static caption', () => {
    const html = render(editorWith('block:image', { src: PNG, caption: 'Static' }, true));

    expect(html).not.toContain('image-tools');
    expect(html).not.toContain('<input');
    expect(html).toContain('<figcaption');
    expect(html).toContain('Static');
  });

  it('callouts render their tone and a disabled icon in read-only mode', () => {
    const html = render(editorWith('block:callout', { tone: 'danger' }, true));

    expect(html).toContain('data-inkbrick-block="callout"');
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain('data-inkbrick-icon="danger"');
    expect(html).toMatch(/data-inkbrick-part="icon"[^>]*disabled/);
  });

  it('a custom emoji icon replaces the tone icon', () => {
    const html = render(editorWith('block:callout', { tone: 'danger', icon: '🔥' }, true));

    expect(html).toContain('🔥');
    expect(html).not.toContain('data-inkbrick-icon');
  });

  it('inserting through the engine keeps working for both new blocks', () => {
    const editor = editorWith('block:callout', {});
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    const caret = editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'block:image', afterId: editor.document.getBlock(note)!.children[1] },
    }) as CaretResult;

    expect(editor.document.getBlock(caret.blockId)!.flavour).toBe('block:image');
  });
});
