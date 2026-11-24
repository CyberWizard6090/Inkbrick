import type { Transaction } from '@inkbrick/store';

import type { AnyCommand } from '../commands/Command';
import type { Engine } from '../editor/Engine';
import { assertPinned, PinnedBlockError, type AfterCommand } from './afterCommand';
import { CommandRegistry } from './CommandRegistry';
import { DEFAULT_GUARDS, type CommandGuard } from './guards';
import { caretBefore, hasExplicitMergeKey, isCaret, mergeKeyOf } from './history';
import type {
  CaretResult,
  CommandName,
  CommandPayload,
  CommandResult,
  EditorIntent,
} from './Intents';

export { PinnedBlockError } from './afterCommand';

interface BatchState {
  transaction: Transaction;
  before?: CaretResult;
  after?: CaretResult;
}

/**
 * Выполняет команды: находит команду в реестре, проверяет общие правила редактора (`CommandGuard`) и её собственное
 * `canExecute`, выполняет в транзакции с записью в историю, затем — обработка после команды (`AfterCommand`). Сами
 * правила живут отдельно (`guards.ts`, `afterCommand.ts`, сведения для истории — `history.ts`); диспетчер их
 * координирует.
 */
export class Dispatcher {
  private readonly registry = new CommandRegistry();

  private readonly guards: CommandGuard[] = [...DEFAULT_GUARDS];

  // Сначала нормализация документа (правила возможностей и общие), затем обработка возможностей, последней — проверка
  // закреплённого блока на итоговом дереве.
  private readonly afterCommand: AfterCommand[] = [
    (engine, transaction, since) => engine.normalizer.normalizeChanged(engine, transaction, since),
    assertPinned,
  ];

  private batchState: BatchState | null = null;

  constructor(private readonly engine: Engine) {}

  register(command: AnyCommand): void {
    this.registry.register(command);
  }

  unregister(type: string): void {
    this.registry.unregister(type);
  }

  has(type: string): boolean {
    return this.registry.has(type);
  }

  /** Добавляет общее правило перед каждой командой; возвращает функцию, которая его снимает. */
  addGuard(guard: CommandGuard): () => void {
    return addTo(this.guards, guard);
  }

  /** Добавляет обработку после каждой выполненной команды (перед проверкой закреплённого блока); снимается вызовом. */
  addAfterCommand(hook: AfterCommand): () => void {
    return addTo(this.afterCommand, hook, this.afterCommand.indexOf(assertPinned));
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
    const command = this.registry.get(type);

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
    const command = this.registry.get(type);

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

    const since = transaction.getChanges().length;
    const result = command.execute({ engine: this.engine, transaction }, payload);

    for (const hook of this.afterCommand) hook(this.engine, transaction, since);

    return result;
  }

  private accepts(
    command: AnyCommand,
    type: string,
    payload: unknown,
    transaction: Transaction,
  ): boolean {
    const { engine } = this;

    return (
      this.guards.every((guard) => guard({ engine, transaction, type, payload })) &&
      command.canExecute({ engine, transaction }, payload)
    );
  }
}

/** Кладёт `item` в список (на место `at`, иначе в конец) и возвращает функцию, которая его убирает. */
function addTo<T>(list: T[], item: T, at = list.length): () => void {
  list.splice(at === -1 ? list.length : at, 0, item);

  return () => {
    const index = list.indexOf(item);

    if (index !== -1) list.splice(index, 1);
  };
}
