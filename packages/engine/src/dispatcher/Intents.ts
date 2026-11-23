import type {
  Alignment,
  BlockId,
  BlockProps,
  InlineNode,
  TextAttributes,
} from '@inkbrick/document';

import type { Fragment } from '../clipboard/types';

export interface InsertTextPayload {
  text: string;
  selection: { anchor: { blockId: BlockId; offset: number } };
}

export interface DeleteTextPayload {
  blockId: BlockId;
  from: number;
  to: number;
}

export interface DeleteBackwardPayload {
  blockId: BlockId;
  offset: number;
}

export interface SplitBlockPayload {
  blockId: BlockId;
  offset: number;
}

export interface MorphBlockPayload {
  blockId: BlockId;
  flavour: string;
  props?: BlockProps;
  /** Сколько первых символов удалить (триггер markdown-шортката вроде «# »). */
  clearFromOffset?: number;
}

export interface ReplaceTextPayload {
  blockId: BlockId;
  from: number;
  to: number;
  text: string;
  /** Вставить текст без форматирования соседних символов (по умолчанию он наследуется от символа слева). */
  plain?: boolean;
}

export interface ToggleFormatPayload {
  blockId: BlockId;
  from: number;
  to: number;
  format: string;
}

export interface SetBlockPropsPayload {
  blockId: BlockId;
  props: BlockProps;
  mergeKey?: string;
}

export interface InsertBlockPayload {
  flavour: string;
  afterId?: BlockId;
  parentId?: BlockId;
  props?: BlockProps;
  content?: InlineNode[];
}

export interface DeleteRangePayload {
  from: { blockId: BlockId; offset: number };
  to: { blockId: BlockId; offset: number };
}

export interface ToggleFormatRangePayload extends DeleteRangePayload {
  format: string;
}

export interface ConvertBlockPayload {
  blockId: BlockId;
  flavour: string;
  props?: BlockProps;
  offset?: number;
}

export interface SetInlineAttributesPayload extends DeleteRangePayload {
  /** Атрибуты для диапазона; значение undefined снимает атрибут (например, `{ link: undefined }`). */
  attributes: Partial<TextAttributes>;
}

export interface InsertFormulaPayload {
  blockId: BlockId;
  from: number;
  to: number;
  latex: string;
}

export interface SetAlignPayload extends DeleteRangePayload {
  align: Alignment;
}

export interface MoveBlockPayload {
  blockId: BlockId;
  targetId: BlockId;
  position: 'before' | 'after';
}

export interface MoveBlockToSidePayload {
  blockId: BlockId;
  targetId: BlockId;
  /** С какой стороны от `targetId` встанет блок: рядом, в колонках. */
  side: 'left' | 'right';
}

export interface PasteFragmentPayload {
  at: { blockId: BlockId; offset: number };
  fragment: Fragment;
}

export interface BlockTargetPayload {
  blockId: BlockId;
}

/**
 * Команды редактора: имя → данные (`payload`) и результат (`result`). По этой карте `editor.dispatch`,
 * `editor.execute` и `editor.can` проверяют данные и знают тип результата. Результат `undefined` — команда не выполнена
 * (недопустима здесь, редактор только для чтения, затронула бы закреплённый блок).
 *
 * Свои команды добавляются в карту объявлением модуля — тогда и они проверяются:
 *
 * ```ts
 * declare module '@inkbrick/engine' {
 *   interface CommandMap {
 *     'callout:toggle-icon': { payload: { blockId: string }; result: void };
 *   }
 * }
 * ```
 */
export interface CommandMap {
  insertText: { payload: InsertTextPayload; result: CaretResult };
  deleteText: { payload: DeleteTextPayload; result: CaretResult };
  deleteBackward: { payload: DeleteBackwardPayload; result: CaretResult | undefined };
  splitBlock: { payload: SplitBlockPayload; result: CaretResult };
  morphBlock: { payload: MorphBlockPayload; result: CaretResult };
  replaceText: { payload: ReplaceTextPayload; result: CaretResult };
  toggleFormat: { payload: ToggleFormatPayload; result: void };
  setBlockProps: { payload: SetBlockPropsPayload; result: void };
  insertBlock: { payload: InsertBlockPayload; result: CaretResult | undefined };
  convertBlock: { payload: ConvertBlockPayload; result: CaretResult };
  pasteFragment: { payload: PasteFragmentPayload; result: CaretResult };
  moveBlock: { payload: MoveBlockPayload; result: CaretResult };
  moveBlockToSide: { payload: MoveBlockToSidePayload; result: CaretResult };
  duplicateBlock: { payload: BlockTargetPayload; result: CaretResult };
  deleteRange: { payload: DeleteRangePayload; result: CaretResult };
  toggleFormatRange: { payload: ToggleFormatRangePayload; result: void };
  setInlineAttributes: { payload: SetInlineAttributesPayload; result: void };
  insertFormula: { payload: InsertFormulaPayload; result: CaretResult };
  setAlign: { payload: SetAlignPayload; result: void };
  indentBlock: { payload: BlockTargetPayload; result: void };
  outdentBlock: { payload: BlockTargetPayload; result: void };
  'insert-paragraph': { payload: { targetId: BlockId }; result: BlockId };
  'delete-block': { payload: { id: BlockId }; result: void };
  'delete-blocks': { payload: { ids: readonly BlockId[] }; result: void };
  'toggle-heading': { payload: { id: BlockId; level?: 1 | 2 | 3 | 4 | 5 | 6 }; result: void };
}

/** Имя команды из `CommandMap`. */
export type CommandName = keyof CommandMap;

/** Данные команды `K`. */
export type CommandPayload<K extends CommandName> = CommandMap[K]['payload'];

/** Результат команды `K`, когда она выполнена (`execute` и `dispatch` дают ещё `undefined`, если нет). */
export type CommandResult<K extends CommandName> = CommandMap[K]['result'];

/** Намерение для `editor.dispatch`: имя команды из `CommandMap` и её данные. */
export type EditorIntent = {
  [K in CommandName]: { type: K; payload: CommandPayload<K> };
}[CommandName];

export interface CaretResult {
  blockId: BlockId;
  offset: number;
}
