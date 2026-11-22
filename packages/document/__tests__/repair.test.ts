import { describe, expect, it } from 'vitest';

import {
  createDocument,
  createSchemaRegistry,
  deserializeDocument,
  repairSnapshot,
  serializeDocument,
  validateSnapshot,
  type DocumentSnapshot,
} from '../src';

const schema = createSchemaRegistry();

function base() {
  const snapshot = serializeDocument(createDocument({ schema }), schema);
  const note = snapshot.blocks[snapshot.rootId].children[0];
  const first = snapshot.blocks[note].children[0];

  return { snapshot, note, first };
}

const paragraph = (id: string, parentId: string | null, text = id, children: string[] = []) => ({
  id,
  flavour: 'block:paragraph',
  parentId,
  children,
  content: [{ insert: text }],
  props: {},
});

function repaired(snapshot: DocumentSnapshot) {
  const result = repairSnapshot(snapshot, schema);

  expect(validateSnapshot(result.snapshot, schema)).toEqual([]);
  expect(() => deserializeDocument(result.snapshot, { schema })).not.toThrow();

  return result;
}

describe('repairSnapshot', () => {
  it('leaves an intact document as it is', () => {
    const { snapshot } = base();
    const result = repaired(snapshot);

    expect(result.fixes).toEqual([]);
    expect(result.snapshot.blocks).toEqual(snapshot.blocks);
  });

  it('re-attaches orphans, a second root and a cycle to the note, keeping their text', () => {
    const { snapshot, note } = base();

    snapshot.blocks.orphan = paragraph('orphan', 'missing-parent');
    snapshot.blocks.root2 = paragraph('root2', null);
    snapshot.blocks.a = { ...paragraph('a', 'b', 'a', ['b']), flavour: 'block:list', props: {} };
    snapshot.blocks.b = { ...paragraph('b', 'a', 'b', ['a']), flavour: 'block:list', props: {} };

    const { snapshot: fixed, fixes } = repaired(snapshot);
    const noteChildren = fixed.blocks[note].children;

    expect(noteChildren).toEqual(expect.arrayContaining(['orphan', 'root2']));
    // Из цикла a ⇄ b получается цепочка: один блок в заметке, второй — его потомок.
    const cycleTop = noteChildren.find((id) => id === 'a' || id === 'b')!;
    expect(fixed.blocks[cycleTop].children).toEqual([cycleTop === 'a' ? 'b' : 'a']);
    expect(fixed.blocks.orphan.content).toEqual([{ insert: 'orphan' }]);
    expect(fixes.length).toBeGreaterThan(0);
  });

  it('keeps a block shared by two parents only in the first one', () => {
    const { snapshot, note, first } = base();

    snapshot.blocks.list = {
      ...paragraph('list', note, 'list', [first]),
      flavour: 'block:list',
      props: { type: 'bullet' },
    };
    snapshot.blocks[note].children.push('list');

    const { snapshot: fixed } = repaired(snapshot);

    expect(fixed.blocks[note].children).toEqual([first, 'list']);
    expect(fixed.blocks.list.children).toEqual([]);
    expect(fixed.blocks[first].parentId).toBe(note);
  });

  it('removes missing and duplicated children, fixes parentId and invalid props', () => {
    const { snapshot, note, first } = base();

    snapshot.blocks[note].children.push('ghost', first);
    snapshot.blocks[first].parentId = 'wrong';
    snapshot.blocks.h = { ...paragraph('h', note), flavour: 'block:heading', props: { level: 99 } };
    snapshot.blocks[note].children.push('h');

    const { snapshot: fixed, fixes } = repaired(snapshot);

    expect(fixed.blocks[note].children).toEqual([first, 'h']);
    expect(fixed.blocks[first].parentId).toBe(note);
    expect(fixed.blocks.h.props).toEqual(schema.createProps('block:heading'));
    expect(fixes.join('\n')).toMatch(/missing child "ghost"/);
  });

  it('recreates a missing root and survives garbage', () => {
    const result = repairSnapshot(
      { rootId: 'r', blocks: { x: 42, y: paragraph('y', 'r') } } as unknown as DocumentSnapshot,
      schema,
    );

    expect(result.snapshot.blocks.r.flavour).toBe('block:page');
    expect(result.fixes.join('\n')).toMatch(/not an object/);
    expect(() => repairSnapshot(null as unknown as DocumentSnapshot, schema)).not.toThrow();
  });

  it('keeps unknown blocks and does not modify the input', () => {
    const { snapshot } = base();

    snapshot.blocks.mystery = { ...paragraph('mystery', 'nowhere'), flavour: 'block:mystery' };

    const before = structuredClone(snapshot);
    const { snapshot: fixed } = repaired(snapshot);

    expect(fixed.blocks.mystery.flavour).toBe('block:mystery');
    expect(snapshot).toEqual(before);
  });
});

describe('block background after repair', () => {
  it('keeps palette names and #rrggbb, including the new colours', () => {
    for (const background of ['teal', 'magenta', '#12ab34']) {
      const { snapshot, first } = base();

      snapshot.blocks[first].props = { alignment: 'left', background };

      const result = repaired(snapshot);

      expect(result.snapshot.blocks[first].props.background, background).toBe(background);
      expect(result.fixes).toEqual([]);
    }
  });

  it('replaces a damaged background with the default props, as before', () => {
    for (const background of ['url(x)', '#fff', 'chartreuse', 'red; x', 5, 'black']) {
      const { snapshot, first } = base();

      snapshot.blocks[first].props = { alignment: 'left', background };

      const result = repaired(snapshot);

      expect(result.snapshot.blocks[first].props, String(background)).toEqual(
        schema.createProps('block:paragraph'),
      );
      expect(result.fixes.length).toBeGreaterThan(0);
    }
  });
});

describe('hostile block ids', () => {
  it('a block with the id «__proto__» does not replace the prototype of the block map', async () => {
    const { migrateSnapshot } = await import('../src');
    const { snapshot, note } = base();
    const hostile = JSON.parse(
      JSON.stringify({ ...snapshot, schemaVersions: {} }).replace(
        '"blocks":{',
        `"blocks":{"__proto__":${JSON.stringify(paragraph('__proto__', note))},`,
      ),
    ) as DocumentSnapshot;
    const migrated = migrateSnapshot(hostile, schema);

    expect(Object.getPrototypeOf(migrated.blocks)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(migrated.blocks, '__proto__')).toBe(true);
    expect(migrated.blocks[snapshot.rootId]).toBeDefined();
  });
});
