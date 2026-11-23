/**
 * Публичный API `@inkbrick/engine`: редактор без интерфейса, намерения и их результаты, свои блоки и команды, буфер
 * обмена и чтение таблиц. Всё, что здесь, следует семантическому версионированию.
 *
 * Механизмы реализации (отдельные команды, помощники таблиц и колонок, диапазоны ячеек) — в
 * `@inkbrick/engine/internal`; это не публичный контракт.
 */

// Редактор.
export { Editor } from './editor';
export type { EditorOptions, HistoryResult } from './editor';
export type { Engine } from './editor';
export type { Dispatcher } from './dispatcher';
export { PinnedBlockError } from './dispatcher';
export type { BlockEngine } from './block';
export type { InlineEngine } from './inline';
export type { RangeFormats } from './formats';

// Намерения (`editor.dispatch`) и их результаты.
export type {
  EditorIntent,
  CaretResult,
  InsertTextPayload,
  DeleteTextPayload,
  DeleteBackwardPayload,
  SplitBlockPayload,
  MorphBlockPayload,
  ReplaceTextPayload,
  ToggleFormatPayload,
  SetBlockPropsPayload,
  InsertBlockPayload,
  DeleteRangePayload,
  ConvertBlockPayload,
  MoveBlockPayload,
  MoveBlockToSidePayload,
  PasteFragmentPayload,
  ToggleFormatRangePayload,
  SetInlineAttributesPayload,
  BlockTargetPayload,
} from './dispatcher';

// Свои команды и блоки.
export type { Command, CommandContext } from './commands';
export { defineBlockCommand, defineBlockController, isBlockDefinition } from './controller';
export type {
  BlockCommand,
  BlockCommandContext,
  BlockCommandPayload,
  BlockContext,
  BlockController,
  BlockControllers,
  BlockDefinition,
  BlockKeyBinding,
  BlockMenuItem,
  BlockSlashItem,
  TypedBlock,
} from './controller';

// Буфер обмена.
export { FRAGMENT_MIME } from './clipboard/types';
export type { Fragment, FragmentBlock } from './clipboard/types';
export { sanitizeFragment } from './clipboard/sanitize';
export { fragmentToHtml, fragmentToPlainText } from './clipboard/serialize';

// Встроенные возможности, которые подключаются явно: `new Editor({ blocks: [...tableBlocks, ...tocBlocks] })`.
export { tableBlocks } from './table';
export { tocBlocks } from './toc';
export { columnsBlocks } from './columns';
export { toggleBlocks } from './toggle';
export { footnoteBlocks } from './footnote';

// Таблицы: правка из кода, чтение значений и диапазоны ячеек.
export {
  createTableEditor,
  tableRangeBetween,
  tableRangeCells,
  tableRangeFragment,
  locateTableCell,
  tableCellAt,
  tableFragment,
  tableIdOf,
  tableSize,
  tableValue,
  MAX_TABLE_CELLS,
  MAX_TABLE_COLUMNS,
  TABLE_BORDER_MODES,
  TABLE_TEXT_FORMATS,
} from './table';
export type {
  TableBorderMode,
  TableCellInput,
  TableCellPosition,
  TableCellRef,
  TableEditorOptions,
  TableFragmentOptions,
  TableRange,
  TableSize,
  TableTextFormat,
  TableValue,
} from './table';
