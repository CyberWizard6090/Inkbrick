import type { Transaction } from '@inkbrick/store';

import type { Engine } from '../editor/Engine';
import { isTextBlock } from '../utils';
import { targetBlockIds } from './history';

/** Что видит проверка перед командой: имя, данные и транзакция, в которой команда выполнится. */
export interface GuardContext {
  readonly engine: Engine;
  readonly transaction: Transaction;
  readonly type: string;
  readonly payload: unknown;
}

/**
 * Общее правило редактора, которое проверяется перед любой командой (раньше её `canExecute`): `false` — команда не
 * выполняется, `dispatch` вернёт `undefined`, `can` — `false`.
 */
export type CommandGuard = (context: GuardContext) => boolean;

/** Только чтение: никакая команда не выполняется. */
export const readOnlyGuard: CommandGuard = ({ engine }) => !engine.readOnly;

const ALLOWED_ON_UNKNOWN = new Set(['delete-block', 'delete-blocks']);

/**
 * Блок с незарегистрированным flavour можно только удалить: иначе команды (ввод, смена типа, форматирование) исказили
 * бы данные, смысл которых редактору неизвестен.
 */
export const unknownBlockGuard: CommandGuard = ({ engine, transaction, type, payload }) =>
  ALLOWED_ON_UNKNOWN.has(type) ||
  !targetBlockIds(payload).some((id) => {
    const block = transaction.getBlock(id);

    return block !== undefined && !engine.schema.hasBlock(block.flavour);
  });

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

export const textBlockGuard: CommandGuard = ({ engine, transaction, type, payload }) =>
  !TEXT_COMMANDS.has(type) ||
  !targetBlockIds(payload).some((id) => {
    const block = transaction.getBlock(id);

    return block !== undefined && !isTextBlock(engine.schema, block);
  });

/** Проверки по умолчанию, в этом порядке. */
export const DEFAULT_GUARDS: readonly CommandGuard[] = [
  readOnlyGuard,
  unknownBlockGuard,
  textBlockGuard,
];
