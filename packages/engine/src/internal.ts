/**
 * `@inkbrick/engine/internal` — механизмы реализации движка: отдельные команды, табличные и колоночные помощники,
 * диапазоны и объединения ячеек, блоки встроенных возможностей. Им пользуется `@inkbrick/react`.
 *
 * **Не стабильный API**: имена и сигнатуры здесь могут меняться в любом выпуске без пометки о несовместимости.
 * Приложениям нужен `@inkbrick/engine`; если чего-то не хватает там — это повод расширить публичный вход.
 */
export { Editor } from './editor';
export type { EditorOptions, HistoryResult } from './editor';
export { Engine } from './editor';
export {
  Dispatcher,
  PinnedBlockError,
  CommandRegistry,
  DEFAULT_GUARDS,
  readOnlyGuard,
  textBlockGuard,
  unknownBlockGuard,
  assertPinned,
} from './dispatcher';
export type { AfterCommand, CommandGuard, GuardContext } from './dispatcher';
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
export * from './commands';
export * from './controller';
export { BlockEngine } from './block';
export { InlineEngine } from './inline';
export type { RangeFormats } from './formats';
export { FRAGMENT_MIME } from './clipboard/types';
export type { Fragment, FragmentBlock } from './clipboard/types';
export { sanitizeFragment } from './clipboard/sanitize';
export { fragmentToHtml, fragmentToPlainText } from './clipboard/serialize';
export * from './table';
export * from './toc';
export * from './footnote';
export * from './columns';
export * from './toggle';
