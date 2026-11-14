import { writeFileSync } from 'node:fs';

import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import { createCollab, project } from '../src';
import { createServerState, schema } from './harness';

/**
 * Начальное состояние нового документа. Сервер (Go) не умеет создавать состояние Yjs, поэтому хранит это
 * состояние файлом и записывает его в каждый новый документ. Чтобы обновить файл:
 * `COLLAB_WRITE_INITIAL_STATE=путь/к/initial_state.bin pnpm vitest run --project @inkbrick/collab initialState`.
 */
describe('initial document state', () => {
  const bytes = createServerState();

  it('opens as a page with one note and one empty paragraph', () => {
    const ydoc = new Y.Doc();

    Y.applyUpdate(ydoc, bytes);

    const snapshot = project(ydoc);
    const root = snapshot.blocks[snapshot.rootId];
    const note = snapshot.blocks[root.children[0]];

    expect(root.flavour).toBe('block:page');
    expect(note.flavour).toBe('block:note');
    expect(note.children).toHaveLength(1);
    expect(() => createCollab({ ydoc, schema })).not.toThrow();
  });

  it('writes the state file on request', () => {
    const target = process.env.COLLAB_WRITE_INITIAL_STATE;

    if (!target) return;

    writeFileSync(target, bytes);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
