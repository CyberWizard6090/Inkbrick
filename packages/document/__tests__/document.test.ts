import { describe, expect, it } from 'vitest';

import { Document, type BaseBlock } from '../src';

const block = (id: string, parentId: string | null, children: string[] = []): BaseBlock => ({
  id,
  flavour: 'block:paragraph',
  parentId,
  children,
  content: [],
  props: {},
});

function sample() {
  const doc = new Document('root');
  doc._setBlock(block('root', null, ['a', 'b', 'c']));
  doc._setBlock(block('a', 'root'));
  doc._setBlock(block('b', 'root'));
  doc._setBlock(block('c', 'root'));
  return doc;
}

describe('Document', () => {
  it('returns siblings', () => {
    const doc = sample();

    expect(doc.getNextSibling('a')?.id).toBe('b');
    expect(doc.getPreviousSibling('c')?.id).toBe('b');
    expect(doc.getPreviousSibling('a')).toBeUndefined();
    expect(doc.getNextSibling('c')).toBeUndefined();
  });

  it('replaces the parent object when children change (React relies on this)', () => {
    const doc = sample();
    const before = doc.getBlock('root')!;

    doc._insertChild('root', 1, 'x');
    const after = doc.getBlock('root')!;

    expect(after).not.toBe(before);
    expect(before.children).toEqual(['a', 'b', 'c']);
    expect(after.children).toEqual(['a', 'x', 'b', 'c']);
  });

  it('refuses to insert the same child twice', () => {
    const doc = sample();

    expect(() => doc._insertChild('root', 0, 'a')).toThrow();
  });

  it('moves a child between parents and updates parentId', () => {
    const doc = sample();

    doc._moveChild('root', 'a', 'c', 0);

    expect(doc.getBlock('root')!.children).toEqual(['a', 'b']);
    expect(doc.getBlock('a')!.children).toEqual(['c']);
    expect(doc.getBlock('c')!.parentId).toBe('a');
  });

  it('throws on a missing parent', () => {
    expect(() => sample()._insertChild('nope', 0, 'x')).toThrow();
  });

  it('a block cannot be listed in a second parent: it has to be moved', () => {
    const doc = sample();

    expect(() => doc._insertChild('a', 0, 'b')).toThrow(/belongs to "root"/);
    expect(doc.getBlock('a')!.children).toEqual([]);
  });

  it('moving a block into its own descendant fails and leaves the tree as it was', () => {
    const doc = sample();

    doc._moveChild('root', 'a', 'c', 0);

    expect(() => doc._moveChild('root', 'c', 'a', 0)).toThrow(/inside itself/);
    expect(doc.getBlock('root')!.children).toEqual(['a', 'b']);
    expect(doc.getBlock('a')!.parentId).toBe('root');
    expect(doc.getBlock('a')!.children).toEqual(['c']);
  });
});
