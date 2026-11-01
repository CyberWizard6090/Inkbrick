import { describe, expect, it } from 'vitest';

import { createDocument, createSchemaRegistry, z, type BlockSchema } from '../src';

describe('SchemaRegistry', () => {
  const schema = createSchemaRegistry();

  it('knows all built-in blocks', () => {
    expect(
      schema
        .getAllBlockSchemas()
        .map((s) => s.flavour)
        .sort(),
    ).toEqual([
      'block:callout',
      'block:code',
      'block:divider',
      'block:formula',
      'block:heading',
      'block:image',
      'block:list',
      'block:note',
      'block:page',
      'block:paragraph',
      'block:quote',
    ]);
  });

  it('validates parent/child relations in both directions', () => {
    expect(schema.validateRelation('block:page', 'block:note')).toBe(true);
    expect(schema.validateRelation('block:note', 'block:paragraph')).toBe(true);
    expect(schema.validateRelation('block:note', 'block:note')).toBe(false);
    expect(schema.validateRelation('block:paragraph', 'block:paragraph')).toBe(false);
    expect(schema.validateRelation('block:list', 'block:list')).toBe(true);
    expect(schema.validateRelation('block:unknown', 'block:paragraph')).toBe(false);
  });

  it('fills props with schema defaults', () => {
    expect(schema.createProps('block:heading')).toEqual({ level: 1, align: 'left' });
    expect(schema.createProps('block:heading', { level: 3 })).toEqual({ level: 3, align: 'left' });
  });

  it('rejects invalid props', () => {
    expect(() => schema.createProps('block:heading', { level: 9 })).toThrow();
    expect(schema.validateProps('block:list', { type: 'nope' }).success).toBe(false);
  });

  it('getBlockSchema does not throw for unknown flavours', () => {
    expect(schema.getBlockSchema('block:nope')).toBeUndefined();
    expect(() => schema.requireBlockSchema('block:nope')).toThrow();
  });
});

describe('createDocument', () => {
  it('creates page → note → paragraph with schema-valid props', () => {
    const doc = createDocument();
    const page = doc.getBlock(doc.rootId)!;
    const note = doc.getBlock(page.children[0])!;
    const paragraph = doc.getBlock(note.children[0])!;

    expect(page.flavour).toBe('block:page');
    expect(note.flavour).toBe('block:note');
    expect(paragraph.flavour).toBe('block:paragraph');
    expect(paragraph.props).toEqual({ alignment: 'left' });
    expect(paragraph.parentId).toBe(note.id);
  });
});

describe('SchemaRegistry: register / replace / unregister', () => {
  const custom = (flavour: string, name = 'Custom'): BlockSchema => ({
    flavour,
    name,
    icon: 'x',
    propsSchema: z.object({}),
    allowedParents: ['role:hub'],
    allowedChildren: [],
    commands: [],
    shortcuts: [],
    rendererHint: 'custom',
  });

  it('registering the same flavour twice is an error', () => {
    const registry = createSchemaRegistry();

    expect(() => registry.registerBlock(custom('block:paragraph'))).toThrow(/already registered/);

    registry.registerBlock(custom('block:new'));
    expect(() => registry.registerBlock(custom('block:new'))).toThrow(/replaceBlock/);
  });

  it('replaceBlock overrides only existing blocks; unregisterBlock removes', () => {
    const registry = createSchemaRegistry();

    registry.replaceBlock(custom('block:paragraph', 'My paragraph'));
    expect(registry.getBlockSchema('block:paragraph')!.name).toBe('My paragraph');

    expect(() => registry.replaceBlock(custom('block:missing'))).toThrow(/not registered/);

    expect(registry.unregisterBlock('block:paragraph')).toBe(true);
    expect(registry.hasBlock('block:paragraph')).toBe(false);
    expect(registry.unregisterBlock('block:paragraph')).toBe(false);
  });

  it('createSchemaRegistry: extra blocks override built-ins once; a duplicated new flavour is an error', () => {
    expect(
      createSchemaRegistry([custom('block:quote', 'Quote 2')]).getBlockSchema('block:quote')!.name,
    ).toBe('Quote 2');
    expect(() => createSchemaRegistry([custom('block:widget'), custom('block:widget')])).toThrow(
      /already registered/,
    );
  });
});
