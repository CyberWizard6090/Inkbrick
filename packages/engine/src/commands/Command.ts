import type { Transaction } from '@inkbrick/store';
import type { Engine } from '../editor/Engine';

export interface CommandContext {
  engine: Engine;
  transaction: Transaction;
}

export interface Command<TPayload = unknown, TResult = unknown> {
  readonly type: string;

  canExecute(context: CommandContext, payload: TPayload): boolean;

  execute(context: CommandContext, payload: TPayload): TResult;
}
