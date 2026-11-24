import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';

import { toHtml, toMarkdown, toPlainText, footnoteNumbers } from '@inkbrick/document';
import { sanitizeFragment } from '@inkbrick/engine';
import { availableSlashItems } from '@inkbrick/view';
import type { EditorView } from '@inkbrick/view';

import { footnoteBlocks, getFootnoteIndex, insertFootnote, goToFootnote } from '../src';
import { applySlashItem } from '../src/slash/applySlashItem';
import { useEditorView } from '../src/hooks/useEditorView';
import { mountEditor } from './harness';

beforeEach(() => {
  document.elementFromPoint = () => null;
});

afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
  cleanup();
});

let view: EditorView | null = null;

function Capture() {
  view = useEditorView();

  return null;
}

function mount(texts: string[]) {
  const mounted = mountEditor(texts, { blocks: footnoteBlocks, extra: <Capture /> });
  const note = mounted.editor.document.getBlock(mounted.editor.document.rootId)!.children[0];

  return { ...mounted, note };
}

const labels = () =>
  [...document.querySelectorAll('[data-inkbrick-footnote]')].map(
    (host) => host.shadowRoot!.querySelector('sup')!.textContent,
  );

const insert = (t: ReturnType<typeof mount>, index: number, offset: number) => {
  let done = false;

  act(() => {
    done = insertFootnote(t.editor, view!, t.ids[index], offset);
  });

  return done;
};

const footnoteBlockIds = (t: ReturnType<typeof mount>) =>
  t.editor.document
    .getBlock(t.note)!
    .children.filter((id) => t.editor.document.getBlock(id)!.flavour === 'block:footnote');

describe('footnote insertion', () => {
  it('puts a reference atom in the text and an empty footnote at the end, in one undo step', () => {
    const t = mount(['hello world']);

    t.editor.clearHistory();
    expect(insert(t, 0, 5)).toBe(true);

    const content = t.editor.document.getBlock(t.ids[0])!.content;

    expect(content.map((node) => node.insert).join('')).toBe('hello￼ world');
    expect(content[1].attributes?.footnote).toMatch(/^[\w-]+$/);

    const [footnote] = footnoteBlockIds(t);
    const block = t.editor.document.getBlock(footnote)!;

    expect(block.props.id).toBe(content[1].attributes!.footnote);
    expect(t.editor.document.getBlock(t.note)!.children.at(-1)).toBe(footnote);

    act(() => t.editor.store.undo());
    expect(footnoteBlockIds(t)).toHaveLength(0);
    expect(
      t.editor.document
        .getBlock(t.ids[0])!
        .content.map((node) => node.insert)
        .join(''),
    ).toBe('hello world');
  });

  it('places the caret in the new footnote text', () => {
    const t = mount(['hello']);

    insert(t, 0, 5);

    const [footnote] = footnoteBlockIds(t);
    const host = document.querySelector(`.editable[data-id="${footnote}"]`)!;

    expect(host).toBeTruthy();
    expect(document.querySelector('[data-inkbrick-root]')).toBe(document.activeElement);
  });

  it('numbers the references in reading order and renumbers when one is added before', async () => {
    const t = mount(['first', 'second']);

    insert(t, 1, 6);
    expect(labels()).toEqual(['1']);

    insert(t, 0, 5);

    // Ссылка в первом блоке теперь первая: у прежней номер 2 (индекс пересчитывается после правки, не сразу).
    await waitFor(() => expect(labels()).toEqual(['1', '2']));
    await waitFor(() =>
      expect(
        [...document.querySelectorAll('[data-inkbrick-part="footnote-number"]')].map(
          (node) => node.textContent,
        ),
      ).toEqual(['1', '2']),
    );
  });

  it('places the text of a new footnote among the others by number', () => {
    const t = mount(['one', 'two']);

    insert(t, 1, 3);

    const later = footnoteBlockIds(t)[0];

    insert(t, 0, 3);

    const [first, second] = footnoteBlockIds(t);

    expect(second).toBe(later);
    expect(t.editor.document.getBlock(first)!.props.id).toBe(
      t.editor.document.getBlock(t.ids[0])!.content[1].attributes!.footnote,
    );
  });

  it('refuses code blocks and blocks without text', () => {
    const t = mount(['code']);

    act(() => {
      t.editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: t.ids[0], flavour: 'block:code' },
      });
    });

    expect(insert(t, 0, 0)).toBe(false);
  });
});

describe('footnote navigation', () => {
  it('a click on the reference goes to the text and the back button to the reference', () => {
    const t = mount(['hello']);

    insert(t, 0, 5);

    const [footnote] = footnoteBlockIds(t);

    act(() => void fireEvent.click(document.querySelector('[data-inkbrick-footnote]')!));
    expect(getSelection()!.anchorNode).toBeTruthy();
    expect(goToFootnote(t.editor, view!, 'missing')).toBe(false);

    const back = document.querySelector('[data-inkbrick-part="footnote-back"]')!;

    act(() => void fireEvent.click(back));
    expect(
      getSelection()!
        .anchorNode!.parentElement!.closest('[data-block-id]')!
        .getAttribute('data-block-id'),
    ).toBe(t.ids[0]);
    expect(footnote).toBeTruthy();
  });

  it('a footnote without a reference shows "?" and has no back button', () => {
    const t = mount(['hello']);

    act(() => {
      t.editor.dispatch({
        type: 'insertBlock',
        payload: {
          flavour: 'block:footnote',
          parentId: t.note,
          afterId: t.ids[0],
          props: { id: 'lost' },
        },
      });
    });

    const block = document.querySelector('[data-inkbrick-block="footnote"]')!;

    expect(block.hasAttribute('data-orphan')).toBe(true);
    expect(block.querySelector('[data-inkbrick-part="footnote-number"]')!.textContent).toBe('?');
    expect(block.querySelector('[data-inkbrick-part="footnote-back"]')).toBeNull();
    expect(getFootnoteIndex(t.editor).numberOf('lost')).toBeUndefined();
  });
});

describe('footnote slash item and export', () => {
  it('the slash item replaces "/footnote" by a reference and a footnote text', () => {
    const t = mount(['']);
    const item = footnoteBlocks[0].slashActions![0];

    act(() => {
      t.editor.dispatch({
        type: 'replaceText',
        payload: { blockId: t.ids[0], from: 0, to: 0, text: 'text/footnote' },
      });
      view!.slash.open(t.ids[0], 4);
      view!.slash.update({ query: 'footnote' });
    });
    act(() => applySlashItem(t.editor, view!, item));

    const text = t.editor.document
      .getBlock(t.ids[0])!
      .content.map((node) => node.insert)
      .join('');

    expect(text).toBe('text\uFFFC');
    expect(footnoteBlockIds(t)).toHaveLength(1);
    expect(availableSlashItems(t.editor, [item], t.ids[0])).toHaveLength(1);
  });

  it('the item is hidden in code and is never offered as a block to turn into', () => {
    const t = mount(['a']);
    const item = footnoteBlocks[0].slashActions![0];

    act(() => {
      t.editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: t.ids[0], flavour: 'block:code' },
      });
    });

    expect(availableSlashItems(t.editor, [item], t.ids[0])).toHaveLength(0);
  });

  it('exports numbered references and texts to HTML, Markdown and plain text', () => {
    const t = mount(['See', 'Second']);

    insert(t, 1, 6);
    insert(t, 0, 3);

    const [first, second] = footnoteBlockIds(t);

    for (const [id, text] of [
      [first, 'Alpha'],
      [second, 'Beta'],
    ]) {
      act(() => {
        t.editor.dispatch({ type: 'replaceText', payload: { blockId: id, from: 0, to: 0, text } });
      });
    }

    expect(toMarkdown(t.editor.document, { title: false })).toBe(
      'See[^1]\n\nSecond[^2]\n\n[^1]: Alpha\n\n[^2]: Beta\n',
    );
    expect(toPlainText(t.editor.document, { title: false })).toBe(
      'See[1]\n\nSecond[2]\n\n[1] Alpha\n\n[2] Beta',
    );

    const html = toHtml(t.editor.document, { title: false });

    expect(html).toContain('<sup><a href="#fn-');
    expect(html).toMatch(/<aside id="fn-[\w-]+" data-footnote="1"><sup>1<\/sup> Alpha<\/aside>/);
  });
});

describe('footnote data safety', () => {
  it('sanitizes pasted references: a valid code stays on an object, a bad one is dropped', () => {
    const fragment = sanitizeFragment({
      blocks: [
        {
          flavour: 'block:paragraph',
          props: {},
          children: [],
          content: [
            { insert: 'a' },
            { insert: '￼', attributes: { footnote: 'ok-1' } },
            { insert: '￼', attributes: { footnote: '"><script>' } },
            { insert: 'text', attributes: { footnote: 'ok-2' } },
          ],
        },
      ],
    } as never);

    const nodes = fragment!.blocks[0].content;

    expect(nodes.find((node) => node.attributes?.footnote === 'ok-1')?.insert).toBe('￼');
    expect(JSON.stringify(nodes)).not.toContain('script');
    // Атрибут на обычном тексте не принимается: от ссылки остаётся пустое место.
    expect(nodes.filter((node) => node.attributes?.footnote === 'ok-2')).toHaveLength(0);
  });

  it('numbers by first reference and counts one code once', () => {
    const numbers = footnoteNumbers([
      { content: [{ insert: 'x￼', attributes: { footnote: 'b' } }] },
      { content: [{ insert: '￼', attributes: { footnote: 'a' } }] },
      { content: [{ insert: '￼', attributes: { footnote: 'b' } }] },
    ]);

    expect([...numbers]).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });
});
