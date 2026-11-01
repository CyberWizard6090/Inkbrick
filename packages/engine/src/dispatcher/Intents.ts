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

export interface PasteFragmentPayload {
  at: { blockId: BlockId; offset: number };
  fragment: Fragment;
}

export interface BlockTargetPayload {
  blockId: BlockId;
}

export type EditorIntent =
  | { type: 'insertText'; payload: InsertTextPayload }
  | { type: 'deleteText'; payload: DeleteTextPayload }
  | { type: 'deleteBackward'; payload: DeleteBackwardPayload }
  | { type: 'splitBlock'; payload: SplitBlockPayload }
  | { type: 'morphBlock'; payload: MorphBlockPayload }
  | { type: 'replaceText'; payload: ReplaceTextPayload }
  | { type: 'toggleFormat'; payload: ToggleFormatPayload }
  | { type: 'setBlockProps'; payload: SetBlockPropsPayload }
  | { type: 'insertBlock'; payload: InsertBlockPayload }
  | { type: 'convertBlock'; payload: ConvertBlockPayload }
  | { type: 'pasteFragment'; payload: PasteFragmentPayload }
  | { type: 'moveBlock'; payload: MoveBlockPayload }
  | { type: 'duplicateBlock'; payload: BlockTargetPayload }
  | { type: 'deleteRange'; payload: DeleteRangePayload }
  | { type: 'toggleFormatRange'; payload: ToggleFormatRangePayload }
  | { type: 'setInlineAttributes'; payload: SetInlineAttributesPayload }
  | { type: 'insertFormula'; payload: InsertFormulaPayload }
  | { type: 'setAlign'; payload: SetAlignPayload }
  | { type: 'indentBlock'; payload: BlockTargetPayload }
  | { type: 'outdentBlock'; payload: BlockTargetPayload };

export interface CaretResult {
  blockId: BlockId;
  offset: number;
}
