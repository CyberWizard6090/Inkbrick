import type { Transaction } from '@inkbrick/store';

import { collapseEmptyColumns } from '../columns/columnsCommands';
import type { Engine } from '../editor/Engine';
import type { AnyCommand } from '../commands/Command';
import type {
  CaretResult,
  CommandName,
  CommandPayload,
  CommandResult,
  EditorIntent,
} from './Intents';
import { isTextBlock } from '../utils';
import { caretBefore, hasExplicitMergeKey, isCaret, mergeKeyOf, targetBlockIds } from './history';

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

const ALLOWED_ON_UNKNOWN = new Set(['delete-block', 'delete-blocks']);

/** Команда сняла бы закреплённый блок: транзакция откатывается, `dispatch` возвращает `undefined`. */
export class PinnedBlockError extends Error {
  constructor(id: string) {
    super(`Block "${id}" is pinned and cannot be removed or moved`);
  }
}

interface BatchState {
  transaction: Transaction;
  before?: CaretResult;
  after?: CaretResult;
}

export class Dispatcher {
  private readonly commands = new Map<string, AnyCommand>();

  private batchState: BatchState | null = null;

  constructor(private readonly engine: Engine) {}

  register(command: AnyCommand): void {
    this.commands.set(command.type, command);
  }

  unregister(type: string): void {
    this.commands.delete(type);
  }

  has(type: string): boolean {
    return this.commands.has(type);
  }

  dispatch<I extends EditorIntent>(intent: I): CommandResult<I['type']> | undefined {
    return this.execute(intent.type, intent.payload as never) as
      CommandResult<I['type']> | undefined;
  }

  /** Выполняет команду из `CommandMap`: данные проверены, результат типизирован (`undefined` — не выполнена). */
  execute<K extends CommandName>(type: K, payload: CommandPayload<K>): CommandResult<K> | undefined;
  /** Команда, которой нет в `CommandMap` (своя, не объявленная): данные и результат не проверяются. */
  execute<T extends string>(type: T extends CommandName ? never : T, payload?: unknown): unknown;
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

    try {
      return this.engine.store.transact(
        (transaction) => this.run(command, type, payload, transaction),
        {
          mergeKey: mergeKeyOf(type, payload),
          mergeWindowMs: hasExplicitMergeKey(payload) ? Infinity : undefined,
          describe: (result) => ({
            before: caretBefore(type, payload),
            after: isCaret(result) ? result : undefined,
          }),
        },
      );
    } catch (error) {
      if (error instanceof PinnedBlockError) return undefined;

      throw error;
    }
  }

  /**
   * Проверяет, выполнится ли команда, не меняя документ (для подсветки допустимых целей перетаскивания,
   * доступности пунктов меню). Блоки неизвестного типа и недопустимые цели дают false.
   */
  can<K extends CommandName>(type: K, payload: CommandPayload<K>): boolean;
  can<T extends string>(type: T extends CommandName ? never : T, payload?: unknown): boolean;
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
        mergeWindowMs: options.mergeKey === undefined ? undefined : Infinity,
        describe: () => ({ before: state?.before, after: state?.after }),
      },
    );
  }

  private run(command: AnyCommand, type: string, payload: unknown, transaction: Transaction) {
    if (!this.accepts(command, type, payload, transaction)) return undefined;

    const result = command.execute({ engine: this.engine, transaction }, payload);

    collapseEmptyColumns(this.engine, transaction);
    this.assertPinned(transaction);

    return result;
  }

  private assertPinned(transaction: Transaction): void {
    const { pinned } = this.engine;

    if (!pinned) return;

    const block = transaction.getBlock(pinned.id);

    if (!block || block.flavour !== pinned.flavour || block.parentId !== pinned.parentId) {
      throw new PinnedBlockError(pinned.id);
    }
  }

  private accepts(
    command: AnyCommand,
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
