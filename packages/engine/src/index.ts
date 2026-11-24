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
  CommandMap,
  CommandName,
  CommandPayload,
  CommandResult,
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
export type {
  BlockGroupPayload,
  BlockGroupResult,
  ConvertBlocksPayload,
  MoveBlocksPayload,
  SetBlockBackgroundsPayload,
} from './commands/BlockGroupCommands';

// Свои команды и блоки.
export type { AnyCommand, Command, CommandContext } from './commands';
export { defineBlockCommand, defineBlockController, isBlockDefinition } from './controller';
export type {
  AnyBlockCommand,
  AnyBlockController,
  AnyBlockDefinition,
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

// Подключаемые возможности: `new Editor({ features: [tableFeature, columnsFeature] })` (или их блоки в `blocks`).
export { defineFeature } from './feature';
export { PatchError, applyPatch, onPatch } from './sync';
export type { DocumentPatch, LocalPatch } from './sync';
export type { BlockPoint } from './utils';
export type {
  BlocksSelection,
  CellsSelection,
  SelectionListener,
  SelectionManager,
  SelectionOrigin,
  SelectionState,
  TextSelection,
} from './selection';
export type { DocumentNormalizer, NormalizeContext, NormalizeRule } from './normalizer';
export type { EditorFeature } from './feature';
export { tableBlocks, tableFeature } from './table';
export { tocBlocks, tocFeature } from './toc';
export { columnsBlocks, columnsFeature } from './columns';
export { toggleBlocks, toggleFeature } from './toggle';
export { footnoteBlocks, footnoteFeature } from './footnote';

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

// Подсчёт слов и символов и теги `#тег`: без интерфейса (лимиты, поиск по тегам на сервере); `@inkbrick/react` строит на них
// счётчик и подсветку.
export { countCharacters, countWords, documentStats, selectionStats, statsOf } from './stats';
export type { StatsOptions, StatsRange, TextStats } from './stats';
export { blockTags, collectTags, findTags } from './tags';
export type { TagCount, TagMatch } from './tags';
