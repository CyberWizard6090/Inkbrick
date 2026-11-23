import type { Transaction } from '@inkbrick/store';
import type { Engine } from '../editor/Engine';

export interface CommandContext {
  engine: Engine;
  transaction: Transaction;
}

/** Команда с любыми данными и результатом: так их держит реестр (у каждой свои типы, см. `CommandMap`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry holds commands of different payload and result types
export type AnyCommand = Command<any, any>;

export interface Command<TPayload = unknown, TResult = unknown> {
  readonly type: string;

  canExecute(context: CommandContext, payload: TPayload): boolean;

  execute(context: CommandContext, payload: TPayload): TResult;
}
