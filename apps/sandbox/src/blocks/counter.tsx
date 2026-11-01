import { useSyncExternalStore } from 'react';

import { z, type BlockSchema } from '@inkbrick/document';
import { defineBlockCommand, defineBlockController } from '@inkbrick/engine';
import {
  Editable,
  defineBlock,
  useBlockController,
  type CustomBlockViewProps,
} from '@inkbrick/react';

/**
 * Пример пользовательского блока с контроллером: «счётчик». Подключается снаружи, без правки исходников Inkbrick:
 * `new Editor({ blocks: [counterBlock] })` и `<EditorProvider blocks={[counterBlock]}>`.
 */

export type CounterProps = { count: number; step: number };

export const COUNTER = 'sandbox:counter';

const counterSchema: BlockSchema = {
  flavour: COUNTER,
  name: 'Counter',
  icon: 'plus',
  // Подпись счётчика — обычный текст: в неё ставится каретка (onFocus/onBlur, клавиши контроллера).
  enter: { nextFlavour: 'block:paragraph' },
  propsSchema: z.object({
    count: z.number().int().min(0).default(0),
    step: z.number().int().min(1).max(100).default(1),
  }),
  allowedParents: ['role:hub'],
  allowedChildren: [],
  commands: ['counter.increment', 'counter.decrement', 'counter.reset'],
  shortcuts: [],
  rendererHint: 'counter',
};

const events: string[] = [];
const focused = new Set<string>();
const listeners = new Set<() => void>();

function record(event: string, blockId: string): void {
  events.push(`${event}:${blockId}`);
  for (const listener of [...listeners]) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const counterEvents = (): readonly string[] => events;

export const counterController = defineBlockController<CounterProps>({
  onCreate: ({ block }) => record('create', block.id),
  onInsert: ({ block }) => record('insert', block.id),
  onRemove: ({ block }) => {
    focused.delete(block.id);
    record('remove', block.id);
  },
  onPropsChange: ({ block }) => record(`count=${block.props.count}`, block.id),
  onFocus: ({ block }) => {
    focused.add(block.id);
    record('focus', block.id);
  },
  onBlur: ({ block }) => {
    focused.delete(block.id);
    record('blur', block.id);
  },

  commands: [
    defineBlockCommand<CounterProps>({
      type: 'counter.increment',
      execute: ({ block, setProps }) => setProps({ count: block.props.count + block.props.step }),
    }),
    defineBlockCommand<CounterProps>({
      type: 'counter.decrement',
      canExecute: ({ block }) => block.props.count >= block.props.step,
      execute: ({ block, setProps }) => setProps({ count: block.props.count - block.props.step }),
    }),
    defineBlockCommand<CounterProps>({
      type: 'counter.reset',
      canExecute: ({ block }) => block.props.count !== 0,
      execute: ({ setProps }) => setProps({ count: 0 }),
    }),
  ],

  slashItems: [
    {
      id: 'counter',
      title: 'Counter',
      description: 'Number with + and − buttons',
      keywords: ['counter', 'count', 'счётчик', 'счетчик'],
      icon: 'plus',
    },
  ],

  menuItems: [
    {
      id: 'counter.reset',
      title: 'Reset counter',
      icon: 'replace',
      isDisabled: ({ can }) => !can('counter.reset'),
      run: ({ execute }) => execute('counter.reset'),
    },
  ],

  keymap: [
    {
      id: 'counter.increment',
      keys: 'Alt-ArrowUp',
      run: ({ execute }) => void execute('counter.increment'),
    },
    {
      id: 'counter.decrement',
      keys: 'Alt-ArrowDown',
      run: ({ execute }) => void execute('counter.decrement'),
    },
  ],
});

function CounterView({ block, selected, readOnly }: CustomBlockViewProps<CounterProps>) {
  const counter = useBlockController<CounterProps>(block);
  const isFocused = useSyncExternalStore(
    subscribe,
    () => focused.has(block.id),
    () => false,
  );

  return (
    <div
      className="block sandbox-counter"
      data-inkbrick-block="counter"
      data-block-id={block.id}
      data-selected={selected || undefined}
      data-focused={isFocused || undefined}
      data-testid="counter"
    >
      <div className="sandbox-counter__controls" contentEditable={false}>
        <button
          type="button"
          aria-label="Decrease"
          data-testid="counter-dec"
          disabled={readOnly || !counter.can('counter.decrement')}
          onClick={() => counter.execute('counter.decrement')}
        >
          −
        </button>
        <output data-testid="counter-value" aria-live="polite">
          {block.props.count}
        </output>
        <button
          type="button"
          aria-label="Increase"
          data-testid="counter-inc"
          disabled={readOnly}
          onClick={() => counter.execute('counter.increment')}
        >
          +
        </button>
      </div>
      <div className="sandbox-counter__label">
        <Editable block={block} placeholder="Counter label" />
      </div>
    </div>
  );
}

export const counterBlock = defineBlock<CounterProps>({
  schema: counterSchema,
  component: CounterView,
  controller: counterController,
});
