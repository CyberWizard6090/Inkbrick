import type { Transaction } from '@inkbrick/store';

import type { Engine } from '../editor/Engine';
import type { Command } from '../commands/Command';
import type { CaretResult, EditorIntent } from './Intents';
import { isTextBlock } from '../utils';

function targetBlockIds(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null) return [];

  const p = payload as Record<string, any>;

  return [
    p.blockId,
    p.id,
    p.targetId,
    p.afterId,
    p.selection?.anchor?.blockId,
    p.from?.blockId,
    p.to?.blockId,
    p.at?.blockId,
  ].filter((id): id is string => typeof id === 'string');
}

/** Команды над текстом: блоки без текста (разделитель, контейнеры) их не принимают. */
const TEXT_COMMANDS = new Set([
  'insertText',
  'replaceText',
  'deleteText',
  'toggleFormat',
  'splitBlock',
  'pasteFragment',
  'insertFormula',
]);

const ALLOWED_ON_UNKNOWN = new Set(['delete-block']);

function isCaret(value: unknown): value is CaretResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CaretResult).blockId === 'string' &&
    typeof (value as CaretResult).offset === 'number'
  );
}

function caretBefore(type: string, payload: unknown): CaretResult | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;

  const p = payload as Record<string, any>;

  switch (type) {
    case 'insertText':
      return p.selection?.anchor;
    case 'replaceText':
      return { blockId: p.blockId, offset: p.from };
    case 'deleteText':
      return { blockId: p.blockId, offset: Math.max(p.from, p.to) };
    case 'pasteFragment':
      return p.at;
    case 'insertFormula':
      return { blockId: p.blockId, offset: Math.min(p.from, p.to) };
    case 'setAlign':
    case 'deleteRange':
    case 'toggleFormatRange':
    case 'setInlineAttributes':
      return p.from;
    case 'morphBlock':
      return { blockId: p.blockId, offset: p.clearFromOffset ?? 0 };
    default:
      return typeof p.blockId === 'string'
        ? { blockId: p.blockId, offset: typeof p.offset === 'number' ? p.offset : 0 }
        : undefined;
  }
}

/**
 * Ключ слияния шагов истории: набор текста подряд (по одному символу) и стирание
 * подряд в одном блоке превращаются в один шаг undo.
 */
function mergeKeyOf(type: string, payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;

  const p = payload as Record<string, any>;

  // Явный ключ: вызывающий код сам объединяет связанные правки (например, вставка картинки и её загрузка).
  if (typeof p.mergeKey === 'string') return p.mergeKey;

  if (type === 'insertText') return `insert:${p.selection?.anchor?.blockId}`;
  if (
    type === 'replaceText' &&
    p.from === p.to &&
    typeof p.text === 'string' &&
    p.text.length === 1
  ) {
    return `insert:${p.blockId}`;
  }
  if (type === 'deleteBackward' && p.offset > 0) return `delete:${p.blockId}`;
  if (type === 'deleteText' && Math.abs(p.to - p.from) === 1) return `delete:${p.blockId}`;

  return undefined;
}

interface BatchState {
  transaction: Transaction;
  before?: CaretResult;
  after?: CaretResult;
}

export class Dispatcher {
  private readonly commands = new Map<string, Command<any>>();

  private batchState: BatchState | null = null;

  constructor(private readonly engine: Engine) {}

  register(command: Command<any>): void {
    this.commands.set(command.type, command);
  }

  unregister(type: string): void {
    this.commands.delete(type);
  }

  has(type: string): boolean {
    return this.commands.has(type);
  }

  dispatch(intent: EditorIntent): unknown {
    return this.execute(intent.type, intent.payload);
  }

  execute(type: string, payload?: unknown): unknown {
    const command = this.commands.get(type);

    if (!command) {
      throw new Error(`Unknown command "${type}"`);
    }

    // Внутри batch() все команды делят одну транзакцию и один шаг истории.
    if (this.batchState) {
      const state = this.batchState;
      const before = caretBefore(type, payload);
      const result = this.run(command, type, payload, state.transaction);

      if (result !== undefined) {
        state.before ??= before;
        if (isCaret(result)) state.after = result;
      }

      return result;
    }

    return this.engine.store.transact(
      (transaction) => this.run(command, type, payload, transaction),
      {
        mergeKey: mergeKeyOf(type, payload),
        describe: (result) => ({
          before: caretBefore(type, payload),
          after: isCaret(result) ? result : undefined,
        }),
      },
    );
  }

  /**
   * Проверяет, выполнится ли команда, не меняя документ (для подсветки допустимых целей перетаскивания,
   * доступности пунктов меню). Блоки неизвестного типа и недопустимые цели дают false.
   */
  can(type: string, payload?: unknown): boolean {
    const command = this.commands.get(type);

    if (!command) return false;

    const transaction = this.engine.store.createTransaction();

    try {
      return this.accepts(command, type, payload, transaction);
    } finally {
      transaction.rollback();
    }
  }

  /**
   * Выполняет несколько команд как одно действие: одна транзакция, один шаг undo,
   * один рендер. При ошибке откатывается всё.
   */
  batch<T>(fn: () => T, options: { mergeKey?: string } = {}): T {
    if (this.batchState) return fn();

    let state: BatchState | undefined;

    return this.engine.store.transact(
      (transaction) => {
        state = { transaction };
        this.batchState = state;

        try {
          return fn();
        } finally {
          this.batchState = null;
        }
      },
      {
        mergeKey: options.mergeKey,
        describe: () => ({ before: state?.before, after: state?.after }),
      },
    );
  }

  private run(command: Command<any>, type: string, payload: unknown, transaction: Transaction) {
    if (!this.accepts(command, type, payload, transaction)) return undefined;

    return command.execute({ engine: this.engine, transaction }, payload);
  }

  private accepts(
    command: Command<any>,
    type: string,
    payload: unknown,
    transaction: Transaction,
  ): boolean {
    const context = { engine: this.engine, transaction };

    if (this.engine.readOnly) return false;

    /*
     * Блок с незарегистрированным flavour можно только удалить: иначе команды
     * (ввод, смена типа, форматирование) исказили бы данные, смысл которых редактору неизвестен.
     */
    if (
      !ALLOWED_ON_UNKNOWN.has(type) &&
      targetBlockIds(payload).some((id) => {
        const block = transaction.getBlock(id);
        return block !== undefined && !this.engine.schema.hasBlock(block.flavour);
      })
    ) {
      return false;
    }

    if (
      TEXT_COMMANDS.has(type) &&
      targetBlockIds(payload).some((id) => {
        const block = transaction.getBlock(id);
        return block !== undefined && !isTextBlock(this.engine.schema, block);
      })
    ) {
      return false;
    }

    return command.canExecute(context, payload);
  }
}
