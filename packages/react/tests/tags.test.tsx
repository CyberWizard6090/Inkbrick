import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent } from '@testing-library/react';

import { TagHighlights, blockTags, collectTags, findTags } from '../src';
import { mountEditor } from './harness';

afterEach(cleanup);

const names = (text: string) => findTags(text).map(({ tag }) => tag);

describe('finding tags', () => {
  it('finds #tags with letters, digits, underscores, hyphens and slashes, in any alphabet', () => {
    expect(names('a #idea and #идея, #to-do #project/task_1.')).toEqual([
      'idea',
      'идея',
      'to-do',
      'project/task_1',
    ]);
  });

  it('gives the offsets of the # and the end of the tag', () => {
    expect(findTags('x #ab y')).toEqual([{ tag: 'ab', from: 2, to: 5 }]);
  });

  it('is not fooled by headings, numbers, entities, and hashes inside words', () => {
    expect(names('# Heading')).toEqual([]);
    expect(names('issue #123')).toEqual([]);
    expect(names('a#b')).toEqual([]);
    expect(names('&#39;')).toEqual([]);
    expect(names('/#/route')).toEqual([]);
    expect(names('##double')).toEqual([]);
    expect(names('#1a')).toEqual(['1a']);
  });

  it('leaves trailing punctuation out of the tag', () => {
    expect(names('see #tag- and #a/')).toEqual(['tag', 'a']);
  });
});

describe('tags in blocks', () => {
  it('ignores code, links and formulas, whatever their text', () => {
    const { editor, ids } = mountEditor(['#plain `#inline` [#link](https://x.y) #more']);

    // Вручную размечаем: код, ссылка и обычный текст.
    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: ids[0], from: 0, to: 44, text: '' },
      });
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: ids[0], from: 0, to: 0, text: '#plain #inline #link #more' },
      });
      editor.dispatch({
        type: 'setInlineAttributes',
        payload: {
          from: { blockId: ids[0], offset: 7 },
          to: { blockId: ids[0], offset: 14 },
          attributes: { code: true },
        },
      });
      editor.dispatch({
        type: 'setInlineAttributes',
        payload: {
          from: { blockId: ids[0], offset: 15 },
          to: { blockId: ids[0], offset: 20 },
          attributes: { link: 'https://example.com' },
        },
      });
    });

    expect(blockTags(editor.document.getBlock(ids[0])!).map(({ tag }) => tag)).toEqual([
      'plain',
      'more',
    ]);
  });

  it('does not look for tags in a code block', () => {
    const { editor, ids } = mountEditor(['#tag']);

    act(() => {
      editor.dispatch({
        type: 'convertBlock',
        payload: { blockId: ids[0], flavour: 'block:code', props: {} },
      });
    });

    expect(collectTags(editor)).toEqual([]);
  });
});

describe('collecting the tags of a document', () => {
  it('counts mentions, joins letter cases, and sorts by count then name', () => {
    const { editor } = mountEditor(['#b #Idea', '#idea #a', 'plain #idea']);

    expect(collectTags(editor)).toEqual([
      { tag: 'Idea', count: 3 },
      { tag: 'a', count: 1 },
      { tag: 'b', count: 1 },
    ]);
  });
});

describe('<TagHighlights />', () => {
  const later = () =>
    act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
  const options = () => [
    ...document.querySelectorAll<HTMLElement>('[data-testid="tag-suggestions"] [role="option"]'),
  ];
  it('suggests the tags of the document and of the application while a # is being typed', async () => {
    const mounted = mountEditor(['#project #personal', ''], {
      extra: <TagHighlights suggestions={['projects-archive', 'zeta']} />,
    });
    const { ids } = mounted;

    mounted.caret(ids[1], 0);
    act(() => {
      mounted.editor.dispatch({
        type: 'replaceText',
        payload: { blockId: ids[1], from: 0, to: 0, text: '#pro' },
      });
    });
    mounted.caret(ids[1], 4);
    await later();

    expect(options().map((option) => option.dataset.tag)).toEqual(['project', 'projects-archive']);
  });

  it('Enter puts the chosen tag in place of the typed start', async () => {
    const mounted = mountEditor(['#project', ''], { extra: <TagHighlights /> });
    const { ids, editor } = mounted;

    mounted.caret(ids[1], 0);
    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: ids[1], from: 0, to: 0, text: 'x #pr' },
      });
    });
    mounted.caret(ids[1], 5);
    await later();

    expect(options()).toHaveLength(1);

    act(() => {
      fireEvent.keyDown(document.body, { key: 'Enter' });
    });

    expect(editor.engine.inline.toPlainText(editor.document.getBlock(ids[1])!.content)).toBe(
      'x #project',
    );
  });

  it('Escape closes the list until the text changes, ArrowDown moves the choice', async () => {
    const mounted = mountEditor(['#alpha #apple', ''], { extra: <TagHighlights /> });
    const { ids, editor } = mounted;

    mounted.caret(ids[1], 0);
    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: ids[1], from: 0, to: 0, text: '#a' },
      });
    });
    mounted.caret(ids[1], 2);
    await later();

    expect(options()).toHaveLength(2);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');

    act(() => void fireEvent.keyDown(document.body, { key: 'ArrowDown' }));
    expect(options()[1].getAttribute('aria-selected')).toBe('true');

    act(() => void fireEvent.keyDown(document.body, { key: 'Escape' }));
    expect(options()).toHaveLength(0);
  });

  it('shows nothing in a read-only document or when suggest is off', async () => {
    const mounted = mountEditor(['#alpha', ''], { extra: <TagHighlights suggest={false} /> });
    const { ids, editor } = mounted;

    mounted.caret(ids[1], 0);
    act(() => {
      editor.dispatch({
        type: 'replaceText',
        payload: { blockId: ids[1], from: 0, to: 0, text: '#a' },
      });
    });
    mounted.caret(ids[1], 2);
    await later();

    expect(options()).toHaveLength(0);
  });

  it('Ctrl+click on a tag reports it, a plain click does not', () => {
    const calls: string[] = [];
    const mounted = mountEditor(['see #idea here'], {
      extra: <TagHighlights onTagClick={(tag) => calls.push(tag)} />,
    });
    const { ids, root } = mounted;

    mounted.caret(ids[0], 6);
    act(() => void fireEvent.click(root.querySelector('.editable')!, { ctrlKey: true }));
    expect(calls).toEqual(['idea']);

    act(() => void fireEvent.click(root.querySelector('.editable')!));
    mounted.caret(ids[0], 1);
    act(() => void fireEvent.click(root.querySelector('.editable')!, { ctrlKey: true }));
    expect(calls).toEqual(['idea']);
  });
});
