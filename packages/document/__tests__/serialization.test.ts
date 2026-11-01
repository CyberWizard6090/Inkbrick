import { describe, expect, it } from 'vitest';

import {
  createDocument,
  createSchemaRegistry,
  deserializeDocument,
  serializeDocument,
  validateSnapshot,
  z,
  type BlockSchema,
} from '../src';

const WidgetSchema: BlockSchema = {
  flavour: 'block:widget',
  name: 'Widget',
  icon: 'info',
  propsSchema: z.object({ tone: z.enum(['info', 'warn']).default('info') }),
  allowedParents: ['block:note'],
  allowedChildren: [],
  commands: [],
  shortcuts: [],
  rendererHint: 'widget',
};

function snapshotWithWidget(props: Record<string, unknown> = { tone: 'warn' }) {
  const schema = createSchemaRegistry([WidgetSchema]);
  const snapshot = serializeDocument(createDocument({ schema }));
  const note = snapshot.blocks[snapshot.rootId].children[0];

  snapshot.blocks['c1'] = {
    id: 'c1',
    flavour: 'block:widget',
    parentId: note,
    children: [],
    content: [{ insert: 'hi' }],
    props,
  };
  snapshot.blocks[note].children.push('c1');

  return { snapshot, schema };
}

describe('serialization', () => {
  it('round-trips a document without changes', () => {
    const { snapshot, schema } = snapshotWithWidget();

    const restored = deserializeDocument(snapshot, { schema });

    expect(serializeDocument(restored)).toEqual(snapshot);
  });

  it('produces plain JSON (no functions, components or class instances)', () => {
    const { snapshot } = snapshotWithWidget();

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('keeps blocks of an unregistered flavour intact', () => {
    const { snapshot } = snapshotWithWidget();
    const withoutWidget = createSchemaRegistry();

    expect(validateSnapshot(snapshot, withoutWidget)).toEqual([]);

    const restored = deserializeDocument(snapshot, { schema: withoutWidget });

    expect(serializeDocument(restored)).toEqual(snapshot);
  });

  it('rejects invalid props of a known flavour', () => {
    const { snapshot, schema } = snapshotWithWidget({ tone: 'purple' });

    expect(() => deserializeDocument(snapshot, { schema })).toThrow('invalid props');
  });

  it('reports broken tree links', () => {
    const { snapshot, schema } = snapshotWithWidget();
    snapshot.blocks['c1'].parentId = 'nope';
    snapshot.blocks[snapshot.rootId].children.push('ghost');

    const issues = validateSnapshot(snapshot, schema);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('references missing child "ghost"'),
        expect.stringContaining('child "c1" has parentId "nope"'),
        expect.stringContaining('block "c1" has a missing parent "nope"'),
      ]),
    );
  });

  it('reports a second root, a block its parent does not list, and an unreachable cycle', () => {
    const { snapshot, schema } = snapshotWithWidget();
    const note = snapshot.blocks[snapshot.rootId].children[0];
    const block = (id: string, parentId: string | null, children: string[] = []) => ({
      id,
      flavour: 'block:paragraph',
      parentId,
      children,
      content: [],
      props: {},
    });

    snapshot.blocks['root2'] = block('root2', null);
    snapshot.blocks['stray'] = block('stray', note);
    snapshot.blocks['a'] = { ...block('a', 'b', ['b']), flavour: 'block:list' };
    snapshot.blocks['b'] = { ...block('b', 'a', ['a']), flavour: 'block:list' };

    const issues = validateSnapshot(snapshot, schema);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"root2" is a second root'),
        expect.stringContaining('"stray" is not listed in the children of its parent'),
        expect.stringMatching(/not reachable from the root: .*"a".*"b"/),
      ]),
    );
    expect(() => deserializeDocument(snapshot, { schema })).toThrow();
  });

  it('a valid document has no tree issues', () => {
    const { snapshot, schema } = snapshotWithWidget();

    expect(validateSnapshot(snapshot, schema)).toEqual([]);
  });

  it('does not share objects with the snapshot', () => {
    const { snapshot, schema } = snapshotWithWidget();
    const restored = deserializeDocument(snapshot, { schema });

    snapshot.blocks['c1'].content.push({ insert: 'mutated' });

    expect(restored.getBlock('c1')!.content).toEqual([{ insert: 'hi' }]);
  });
});

describe('custom block definitions', () => {
  it('are placeable in a note via allowedParents and validated by their schema', () => {
    const schema = createSchemaRegistry([WidgetSchema]);

    expect(schema.validateRelation('block:note', 'block:widget')).toBe(true);
    expect(schema.validateRelation('block:paragraph', 'block:widget')).toBe(false);
    expect(schema.createProps('block:widget')).toEqual({ tone: 'info' });
    expect(() => schema.createProps('block:widget', { tone: 'x' })).toThrow();
    expect(createSchemaRegistry().validateRelation('block:note', 'block:widget')).toBe(false);
  });
});

describe('validateSnapshot on malformed input (data from outside)', () => {
  const schema = createSchemaRegistry();
  const page = (children: string[]) => ({
    id: 'r',
    flavour: 'block:page',
    parentId: null,
    children,
    content: [],
    props: { title: 'x' },
  });
  const note = (children: string[] = []) => ({
    id: 'n',
    flavour: 'block:note',
    parentId: 'r',
    children,
    content: [],
    props: {},
  });

  it('reports structural problems instead of crashing', () => {
    const cases: unknown[] = [
      null,
      'x',
      { rootId: 'r' },
      { rootId: 5, blocks: {} },
      { rootId: 'r', blocks: { r: null } },
      { rootId: 'r', blocks: { r: { ...page(['n']), children: 'n' }, n: note() } },
      { rootId: 'r', blocks: { r: page(['n', 'n']), n: note() } },
      { rootId: 'r', blocks: { r: page(['n']), n: { ...note(), content: [{ insert: 5 }] } } },
      { rootId: 'r', blocks: { r: page(['n']), n: { ...note(), props: null } } },
      { rootId: 'r', blocks: { r: { ...page(['n']), parentId: 'n' }, n: note() } },
      { rootId: 'r', blocks: { r: page(['n']), n: { ...note(), flavour: '' } } },
    ];

    for (const snapshot of cases) {
      expect(validateSnapshot(snapshot as never, schema).length).toBeGreaterThan(0);
      expect(() => deserializeDocument(snapshot as never, { schema })).toThrow();
    }
  });

  it('still accepts a valid document', () => {
    const snapshot = { rootId: 'r', blocks: { r: page(['n']), n: note() } };

    expect(validateSnapshot(snapshot as never, schema)).toEqual([]);
  });
});
