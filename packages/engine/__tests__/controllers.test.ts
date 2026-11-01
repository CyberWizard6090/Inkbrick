import { describe, expect, it, vi } from 'vitest';

import {
  createSchemaRegistry,
  deserializeDocument,
  serializeDocument,
  z,
  type BlockSchema,
} from '@inkbrick/document';

import {
  Editor,
  defineBlockCommand,
  defineBlockController,
  type BlockDefinition,
  type CaretResult,
} from '../src';

type CounterProps = { count: number; step: number };

const CounterSchema: BlockSchema = {
  flavour: 'test:counter',
  name: 'Counter',
  icon: 'plus',
  inline: false,
  propsSchema: z.object({
    count: z.number().int().min(0).default(0),
    step: z.number().int().min(1).default(1),
  }),
  allowedParents: ['role:hub'],
  allowedChildren: [],
  commands: [],
  shortcuts: [],
  rendererHint: 'counter',
};

const increment = defineBlockCommand<CounterProps, { by?: number }>({
  type: 'counter.increment',
  execute({ block, setProps }, { by }) {
    setProps({ count: block.props.count + (by ?? block.props.step) });
  },
});

const decrement = defineBlockCommand<CounterProps>({
  type: 'counter.decrement',
  canExecute: ({ block }) => block.props.count > 0,
  execute({ block, setProps }) {
    setProps({ count: block.props.count - block.props.step });
  },
});

function setup(hooks: Partial<Parameters<typeof defineBlockController<CounterProps>>[0]> = {}) {
  const calls: string[] = [];
  const log =
    (name: string) =>
    ({ block }: { block: { id: string } }) => {
      calls.push(`${name}:${block.id}`);
    };

  const controller = defineBlockController<CounterProps>({
    onCreate: log('create'),
    onInsert: log('insert'),
    onRemove: log('remove'),
    onFocus: log('focus'),
    onBlur: log('blur'),
    onPropsChange: ({ block }, previous) => {
      calls.push(`props:${previous.count}->${block.props.count}`);
    },
    commands: [increment, decrement],
    ...hooks,
  });

  const definition: BlockDefinition<CounterProps> = { schema: CounterSchema, controller };
  const editor = new Editor({ blocks: [definition] });
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const firstId = editor.document.getBlock(noteId)!.children[0];

  const insertCounter = () =>
    (
      editor.dispatch({
        type: 'insertBlock',
        payload: { flavour: 'test:counter', afterId: firstId },
      }) as CaretResult
    ).blockId;

  return { editor, calls, firstId, insertCounter, definition };
}

describe('block controllers', () => {
  it('registers the schema and the controller from one definition', () => {
    const { editor } = setup();

    expect(editor.schema.hasBlock('test:counter')).toBe(true);
    expect(editor.controllers.has('test:counter')).toBe(true);
    expect(editor.dispatcher.has('counter.increment')).toBe(true);
  });

  it('calls onCreate and onInsert on insertion, onRemove on deletion and again on undo/redo', () => {
    const { editor, calls, insertCounter } = setup();
    const id = insertCounter();

    expect(calls).toEqual([`create:${id}`, `insert:${id}`]);

    calls.length = 0;
    editor.execute('delete-block', { id });
    expect(calls).toEqual([`remove:${id}`]);

    calls.length = 0;
    editor.undo();
    expect(calls).toEqual([`create:${id}`, `insert:${id}`]);

    calls.length = 0;
    editor.undo();
    expect(calls).toEqual([`remove:${id}`]);
  });

  it('runs own commands only on its own blocks and reports props changes', () => {
    const { editor, calls, firstId, insertCounter } = setup();
    const id = insertCounter();
    calls.length = 0;

    editor.execute('counter.increment', { blockId: id });
    editor.execute('counter.increment', { blockId: id, by: 5 });
    expect(editor.store.getBlock(id)!.props).toEqual({ count: 6, step: 1 });
    expect(calls).toEqual(['props:0->1', 'props:1->6']);

    expect(editor.can('counter.increment', { blockId: firstId })).toBe(false);
    expect(editor.execute('counter.increment', { blockId: firstId })).toBeUndefined();
    expect(editor.can('counter.increment', {})).toBe(false);

    calls.length = 0;
    editor.undo();
    expect(calls).toEqual(['props:6->1']);
  });

  it('honours canExecute and rolls back invalid props', () => {
    const { editor, insertCounter } = setup();
    const id = insertCounter();

    expect(editor.can('counter.decrement', { blockId: id })).toBe(false);

    editor.execute('counter.increment', { blockId: id });
    expect(editor.can('counter.decrement', { blockId: id })).toBe(true);

    expect(() => editor.execute('counter.increment', { blockId: id, by: -5 })).toThrow();
    expect(editor.store.getBlock(id)!.props.count).toBe(1);
  });

  it('rejects controller commands in read-only mode', () => {
    const { editor, insertCounter } = setup();
    const id = insertCounter();

    editor.setReadOnly(true);

    expect(editor.can('counter.increment', { blockId: id })).toBe(false);
    expect(editor.execute('counter.increment', { blockId: id })).toBeUndefined();
    expect(editor.store.getBlock(id)!.props.count).toBe(0);

    const context = editor.controllers.contextFor(id)!;
    expect(context.readOnly).toBe(true);
    expect(context.execute('counter.increment')).toBeUndefined();

    editor.setReadOnly(false);
    expect(context.readOnly).toBe(false);
    context.execute('counter.increment');
    expect(editor.store.getBlock(id)!.props.count).toBe(1);
  });

  it('fires onFocus/onBlur when the UI moves the caret, and onBlur before removal', () => {
    const { editor, calls, firstId, insertCounter } = setup();
    const id = insertCounter();
    calls.length = 0;

    editor.controllers.setFocusedBlock(firstId); // параграф: без контроллера
    editor.controllers.setFocusedBlock(id);
    editor.controllers.setFocusedBlock(id); // повтор — без событий
    editor.controllers.setFocusedBlock(firstId);
    editor.controllers.setFocusedBlock(id);
    expect(calls).toEqual([`focus:${id}`, `blur:${id}`, `focus:${id}`]);

    calls.length = 0;
    editor.execute('delete-block', { id });
    expect(calls).toEqual([`blur:${id}`, `remove:${id}`]);
    expect(editor.controllers.focusedBlockId).toBeNull();
  });

  it('fires onFocus when the block under the caret turns into a controlled type, onBlur when it turns back', () => {
    const { editor, calls, firstId } = setup();

    editor.controllers.setFocusedBlock(firstId);
    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: firstId, flavour: 'test:counter' },
    });
    expect(calls).toEqual([`create:${firstId}`, `insert:${firstId}`, `focus:${firstId}`]);

    calls.length = 0;
    editor.undo();
    expect(calls).toEqual([`blur:${firstId}`, `remove:${firstId}`]);
    expect(editor.controllers.focusedBlockId).toBe(firstId);
  });

  it('calls onCreate (without onInsert) for blocks already in a loaded document', () => {
    const { editor, insertCounter } = setup();
    const id = insertCounter();
    const schema = createSchemaRegistry([CounterSchema]);
    const document = deserializeDocument(serializeDocument(editor.document), { schema });
    const onCreate = vi.fn();
    const onInsert = vi.fn();

    const restored = new Editor({
      schema,
      document,
      controllers: { 'test:counter': { onCreate, onInsert } },
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0].block.id).toBe(id);
    expect(onInsert).not.toHaveBeenCalled();
    expect(restored.controllers.has('test:counter')).toBe(true);
  });

  it('treats a type change as removal of one block and creation of another', () => {
    const { editor, calls, firstId } = setup();

    editor.dispatch({
      type: 'convertBlock',
      payload: { blockId: firstId, flavour: 'test:counter' },
    });
    expect(calls).toEqual([`create:${firstId}`, `insert:${firstId}`]);

    calls.length = 0;
    editor.undo(); // снова параграф
    expect(editor.store.getBlock(firstId)!.flavour).toBe('block:paragraph');
    expect(calls).toEqual([`remove:${firstId}`]);
  });

  it('lets hooks dispatch commands as separate history steps', () => {
    const { editor, insertCounter } = setup({
      onInsert: ({ execute }) => {
        execute('counter.increment', { by: 10 });
      },
    });
    const id = insertCounter();

    expect(editor.store.getBlock(id)!.props.count).toBe(10);

    editor.undo(); // отменяет только правку из хука
    expect(editor.store.getBlock(id)!.props.count).toBe(0);
  });

  it('isolates errors thrown by hooks', () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);

    try {
      const { editor, insertCounter } = setup({
        onInsert: () => {
          throw new Error('boom');
        },
      });
      const id = insertCounter();

      expect(editor.store.getBlock(id)).toBeDefined();
      expect(reportError).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects conflicting registrations', () => {
    const { definition } = setup();

    expect(
      () =>
        new Editor({
          blocks: [definition],
          controllers: { 'test:counter': {} },
        }),
    ).toThrow(/already has a controller/);
    expect(() => new Editor({ controllers: { 'test:unknown': {} } })).toThrow(/not registered/);
    expect(
      () =>
        new Editor({
          controllers: {
            'block:paragraph': { commands: [{ ...increment, type: 'setBlockProps' }] },
          },
        }),
    ).toThrow(/already registered/);
  });
});
