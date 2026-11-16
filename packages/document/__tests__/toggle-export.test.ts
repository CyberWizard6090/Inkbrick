import { describe, expect, it } from 'vitest';

import {
  createDocument,
  createSchemaRegistry,
  toggleBlockSchemas,
  toHtml,
  toMarkdown,
  toPlainText,
  validateSnapshot,
  serializeDocument,
  type Document,
} from '../src';

const schema = createSchemaRegistry(toggleBlockSchemas);

function build(open?: boolean): Document {
  const document = createDocument({ schema });
  const note = document.getBlock(document.rootId)!.children[0];
  let index = 0;

  // В новой заметке уже есть пустой абзац: убираем его из дерева, чтобы он не попал в вывод.
  for (const id of [...document.getBlock(note)!.children]) {
    document._removeChild(note, id);
    document._deleteBlock(id);
  }

  const add = (
    flavour: string,
    parentId: string,
    text: string,
    props: Record<string, unknown> = {},
  ) => {
    const id = `b${index++}`;

    document._setBlock({
      id,
      flavour,
      parentId,
      children: [],
      content: text ? [{ insert: text }] : [],
      props: schema.createProps(flavour, props),
    });
    document.getBlock(parentId)!.children.push(id);

    return id;
  };

  const toggle = add('block:toggle', note, 'More', open === undefined ? {} : { open });

  add('block:paragraph', toggle, 'hidden **text**');
  add('block:paragraph', note, 'after');

  return document;
}

describe('toggle block', () => {
  it('exports as <details> with the state of the block', () => {
    expect(toHtml(build(), { schema, title: false })).toBe(
      '<details open><summary>More</summary><p>hidden **text**</p></details>\n<p>after</p>',
    );
    expect(toHtml(build(false), { schema, title: false })).toContain('<details><summary>');
  });

  it('exports to Markdown as <details> with blocks after a blank line', () => {
    expect(toMarkdown(build(false), { schema, title: false })).toBe(
      '<details>\n\n<summary>More</summary>\n\nhidden \\*\\*text\\*\\*\n\n</details>\n\nafter\n',
    );
  });

  it('keeps the nesting in plain text', () => {
    expect(toPlainText(build(), { schema, title: false })).toBe('More\n  hidden **text**\n\nafter');
  });

  it('allows blocks inside and rejects containers', () => {
    expect(schema.validateRelation('block:toggle', 'block:paragraph')).toBe(true);
    expect(schema.validateRelation('block:toggle', 'block:toggle')).toBe(true);
    expect(schema.validateRelation('block:toggle', 'block:note')).toBe(false);
    expect(schema.validateRelation('block:note', 'block:toggle')).toBe(true);
  });

  it('survives a snapshot round trip', () => {
    const document = build(false);
    const snapshot = serializeDocument(document, schema);

    expect(validateSnapshot(snapshot, schema)).toEqual([]);
  });
});
