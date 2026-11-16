import { describe, expect, it } from 'vitest';

import {
  createDocument,
  createSchemaRegistry,
  tocBlockSchemas,
  toHtml,
  toMarkdown,
  toPlainText,
  validateSnapshot,
  serializeDocument,
  type Document,
} from '../src';

const schema = createSchemaRegistry(tocBlockSchemas);

function build(maxLevel?: number): Document {
  const document = createDocument({ schema });
  const note = document.getBlock(document.rootId)!.children[0];
  let index = 0;

  const add = (flavour: string, props: Record<string, unknown>, text = '') => {
    const id = `b${index++}`;

    document._setBlock({
      id,
      flavour,
      parentId: note,
      children: [],
      content: text ? [{ insert: text }] : [],
      props: schema.createProps(flavour, props),
    });
    document.getBlock(note)!.children.push(id);
  };

  add('block:toc', maxLevel === undefined ? {} : { maxLevel });
  add('block:heading', { level: 1 }, 'Intro');
  add('block:paragraph', {}, 'text');
  add('block:heading', { level: 3 }, 'Deep **one**');
  add('block:heading', { level: 2 }, 'Part');
  add('block:heading', { level: 1 }, 'End');

  return document;
}

describe('table of contents export', () => {
  it('writes the headings as a nested list in every format', () => {
    const document = build();

    expect(toMarkdown(document, { schema, title: false })).toContain(
      '- Intro\n  - Deep \\*\\*one\\*\\*\n  - Part\n- End',
    );
    expect(toPlainText(document, { schema, title: false }).split('\n\n')[0]).toBe(
      '- Intro\n  - Deep **one**\n  - Part\n- End',
    );
    expect(toHtml(document, { schema, title: false })).toContain(
      '<nav><ul><li>Intro<ul><li>Deep **one**</li><li>Part</li></ul></li><li>End</li></ul></nav>',
    );
  });

  it('stops at maxLevel and is empty without headings', () => {
    expect(toPlainText(build(1), { schema, title: false }).split('\n\n')[0]).toBe('- Intro\n- End');

    const empty = createDocument({ schema });
    const note = empty.getBlock(empty.rootId)!.children[0];

    empty._setBlock({
      id: 'toc',
      flavour: 'block:toc',
      parentId: note,
      children: [],
      content: [],
      props: schema.createProps('block:toc'),
    });
    empty.getBlock(note)!.children.push('toc');

    expect(toHtml(empty, { schema, title: false })).not.toContain('<nav>');
  });

  it('is a valid block with a default depth of six', () => {
    const document = build();

    expect(validateSnapshot(serializeDocument(document, schema), schema)).toEqual([]);
    expect(schema.createProps('block:toc').maxLevel).toBe(6);
  });
});
