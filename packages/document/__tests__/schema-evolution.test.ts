import { describe, expect, it } from 'vitest';

import {
  DocumentValidationError,
  createDocument,
  createSchemaRegistry,
  deserializeDocument,
  SNAPSHOT_VERSION,
  serializeDocument,
  validateSnapshot,
  z,
  type BlockSchema,
  type DocumentSnapshot,
} from '../src';

const widgetV1 = z.object({ label: z.string().default('') });
const widgetV2 = z.object({ title: z.string().default('') });

const WidgetV2: BlockSchema = {
  flavour: 'block:widget',
  name: 'Widget',
  icon: 'widget',
  role: 'content',
  version: 2,
  // v1 хранил название в `label`, v2 — в `title`.
  migrate: (props, from) => (from < 2 ? { title: props.label } : props),
  allowedParents: ['role:hub'],
  allowedChildren: [],
  commands: [],
  shortcuts: [],
  rendererHint: 'widget',
  propsSchema: widgetV2,
};

const WidgetV1: BlockSchema = {
  ...WidgetV2,
  version: undefined,
  migrate: undefined,
  propsSchema: widgetV1,
};

function snapshotWith(schema = createSchemaRegistry([WidgetV1])): DocumentSnapshot {
  const document = createDocument({ schema });
  const note = document.getBlock(document.rootId)!.children[0];

  document._setBlock({
    id: 'w1',
    flavour: 'block:widget',
    parentId: note,
    children: [],
    content: [],
    props: { label: 'hello' },
  });
  document._insertChild(note, 1, 'w1');

  return serializeDocument(document, schema);
}

describe('block roles and role: constraints', () => {
  const schema = createSchemaRegistry([WidgetV2]);

  it('built-ins declare roles', () => {
    expect(schema.getRole('block:page')).toBe('root');
    expect(schema.getRole('block:note')).toBe('hub');
    expect(schema.getRole('block:paragraph')).toBe('content');
    expect(schema.getRole('block:unknown')).toBe('content');
  });

  it('content blocks may live in any hub, but not in other content blocks or in the root', () => {
    expect(schema.validateRelation('block:note', 'block:heading')).toBe(true);
    expect(schema.validateRelation('block:page', 'block:heading')).toBe(false);
    expect(schema.validateRelation('block:paragraph', 'block:heading')).toBe(false);
    expect(schema.validateRelation('block:list', 'block:heading')).toBe(false);
    expect(schema.validateRelation('block:note', 'block:widget')).toBe(true);
  });

  it('a custom hub accepts content blocks without naming them', () => {
    const section: BlockSchema = {
      ...WidgetV2,
      flavour: 'block:section',
      role: 'hub',
      version: undefined,
      migrate: undefined,
      allowedParents: ['block:note'],
      allowedChildren: '*',
    };
    const custom = createSchemaRegistry([section]);

    expect(custom.validateRelation('block:section', 'block:quote')).toBe(true);
    expect(custom.validateRelation('block:section', 'block:note')).toBe(false);
  });
});

describe('snapshot relation checks', () => {
  const schema = createSchemaRegistry();

  it('rejects a block placed where its schema does not allow it', () => {
    const document = createDocument({ schema });
    const snapshot = serializeDocument(document, schema);
    const note = snapshot.blocks[snapshot.rootId].children[0];
    const paragraph = snapshot.blocks[note].children[0];

    // Заголовок внутри параграфа (у параграфа нет потомков).
    snapshot.blocks.h = {
      id: 'h',
      flavour: 'block:heading',
      parentId: paragraph,
      children: [],
      content: [],
      props: { level: 1, align: 'left' },
    };
    snapshot.blocks[paragraph].children.push('h');

    expect(validateSnapshot(snapshot, schema)).toEqual([
      'block "h" (block:heading) cannot be placed inside "' + paragraph + '" (block:paragraph)',
    ]);
    expect(() => deserializeDocument(snapshot, { schema })).toThrow(DocumentValidationError);
  });

  it('keeps blocks of unknown flavour wherever they are', () => {
    const snapshot = snapshotWith();

    expect(validateSnapshot(snapshot, createSchemaRegistry())).toEqual([]);
  });
});

describe('schema versions and migrations', () => {
  it('serializeDocument records the format version and the schema versions', () => {
    const schema = createSchemaRegistry([WidgetV2]);
    const document = createDocument({ schema });

    expect(serializeDocument(document, schema).schemaVersions).toEqual({
      'block:page': 1,
      'block:note': 1,
      'block:paragraph': 1,
    });
  });

  it('writes the snapshot format version', () => {
    const schema = createSchemaRegistry();

    expect(serializeDocument(createDocument({ schema }), schema).version).toBe(SNAPSHOT_VERSION);
  });

  it('rejects a snapshot in a newer or malformed format', () => {
    const schema = createSchemaRegistry();
    const snapshot = serializeDocument(createDocument({ schema }), schema);

    expect(validateSnapshot({ ...snapshot, version: SNAPSHOT_VERSION + 1 }, schema)).toEqual([
      expect.stringContaining('newer than supported'),
    ]);
    expect(validateSnapshot({ ...snapshot, version: 0 }, schema)).toEqual([
      expect.stringContaining('invalid "version"'),
    ]);
    expect(validateSnapshot({ ...snapshot, version: undefined }, schema)).toEqual([]);
  });

  it('does not migrate props twice after a save with the schema registry', () => {
    // v1 -> v2 хранит название в title; при повторной миграции из уже новых props title затёрся бы.
    const v2 = createSchemaRegistry([WidgetV2]);
    const saved = serializeDocument(
      deserializeDocument(snapshotWith(createSchemaRegistry([WidgetV1])), { schema: v2 }),
      v2,
    );
    const reloaded = deserializeDocument(saved, { schema: v2 });

    expect(reloaded.getBlock('w1')!.props).toEqual({ title: 'hello' });
  });

  it('migrates props saved with an older version', () => {
    const v1 = createSchemaRegistry([WidgetV1]);
    const snapshot = snapshotWith(v1);

    expect(snapshot.schemaVersions?.['block:widget']).toBe(1);

    const v2 = createSchemaRegistry([WidgetV2]);
    const restored = deserializeDocument(snapshot, { schema: v2 });

    expect(restored.getBlock('w1')!.props).toEqual({ title: 'hello' });
    expect(serializeDocument(restored, v2).schemaVersions?.['block:widget']).toBe(2);
  });

  it('treats a snapshot without versions as version 1', () => {
    const snapshot = snapshotWith();

    delete snapshot.schemaVersions;

    const restored = deserializeDocument(snapshot, { schema: createSchemaRegistry([WidgetV2]) });

    expect(restored.getBlock('w1')!.props).toEqual({ title: 'hello' });
  });

  it('does not touch up-to-date blocks and does not mutate the input', () => {
    const v2 = createSchemaRegistry([WidgetV2]);
    const document = createDocument({ schema: v2 });
    const snapshot = serializeDocument(document, v2);
    const copy = structuredClone(snapshot);

    deserializeDocument(snapshot, { schema: v2 });

    expect(snapshot).toEqual(copy);
  });

  it('rejects data saved by a newer schema than supported', () => {
    const snapshot = snapshotWith();

    snapshot.schemaVersions!['block:widget'] = 3;

    expect(() =>
      deserializeDocument(snapshot, { schema: createSchemaRegistry([WidgetV2]) }),
    ).toThrow('newer than supported 2');
  });

  it('reports a failing migration as a validation error', () => {
    const broken: BlockSchema = {
      ...WidgetV2,
      migrate: () => {
        throw new Error('boom');
      },
    };

    expect(() =>
      deserializeDocument(snapshotWith(), { schema: createSchemaRegistry([broken]) }),
    ).toThrow('migration from version 1 failed: boom');
  });

  it('validates the migrated props with the current schema', () => {
    const wrong: BlockSchema = { ...WidgetV2, migrate: () => ({ title: 42 }) };

    expect(() =>
      deserializeDocument(snapshotWith(), { schema: createSchemaRegistry([wrong]) }),
    ).toThrow('invalid props');
  });
});

describe('block meta in snapshots', () => {
  const schema = createSchemaRegistry();

  it('accepts valid meta and rejects malformed one', () => {
    const snapshot = serializeDocument(createDocument({ schema }), schema);
    const note = snapshot.blocks[snapshot.rootId].children[0];

    snapshot.blocks[note].meta = { createdAt: 1, updatedAt: 2, createdBy: 'a' };
    expect(validateSnapshot(snapshot, schema)).toEqual([]);

    snapshot.blocks[note].meta = { createdAt: '1' } as never;
    expect(validateSnapshot(snapshot, schema)).toEqual([`block "${note}" has invalid meta`]);
  });
});
