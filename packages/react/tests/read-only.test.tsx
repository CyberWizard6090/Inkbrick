// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { Editor } from '@inkbrick/engine';

import { DocumentView, EditorProvider, type BlockViewProps } from '../src';
import { BlockSelectionController } from '../src/editing/BlockSelectionController';

describe('BlockSelectionController', () => {
  it('notifies only when the set of selected blocks changes', () => {
    const c = new BlockSelectionController();
    let calls = 0;
    c.subscribe(() => calls++);

    c.set(['a', 'b']);
    expect(c.isSelected('a')).toBe(true);
    expect(c.isSelected('c')).toBe(false);
    expect(calls).toBe(1);

    c.set(['b', 'a']); // тот же набор — без уведомления
    expect(calls).toBe(1);

    c.set(['b']);
    expect(c.isSelected('a')).toBe(false);
    expect(calls).toBe(2);

    c.set([]);
    c.set([]);
    expect(calls).toBe(3);
  });
});

describe('readOnly in server rendering', () => {
  const render = (editor: Editor, props: { readOnly?: boolean } = {}) =>
    renderToString(
      <EditorProvider editor={editor} {...props}>
        <DocumentView />
      </EditorProvider>,
    );

  it('renders an editable root by default and a non-editable one in read-only mode', () => {
    expect(render(new Editor())).toMatch(/contenteditable="true"/i);

    const html = render(new Editor(), { readOnly: true });

    expect(html).toMatch(/contenteditable="false"/i);
    expect(html).toContain('aria-readonly="true"');
  });

  it('passes `selected` and `readOnly` to custom components', () => {
    const seen: Array<{ selected: boolean; readOnly: boolean }> = [];
    const Spy = ({ selected, readOnly }: BlockViewProps) => {
      seen.push({ selected, readOnly });
      return null;
    };

    const editor = new Editor();
    editor.setReadOnly(true);

    renderToString(
      <EditorProvider editor={editor} components={{ 'block:paragraph': Spy }}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(seen).toEqual([{ selected: false, readOnly: true }]);
  });

  it('the prop takes effect in the first render, while the engine is synchronised by an effect (client only)', () => {
    const editor = new Editor();

    // UI уже в режиме чтения (нет подмены после гидратации) ...
    expect(render(editor, { readOnly: true })).toMatch(/contenteditable="false"/i);
    // ... а на сервере эффекты не выполняются: состояние движка меняется только на клиенте.
    expect(editor.readOnly).toBe(false);
  });
});
