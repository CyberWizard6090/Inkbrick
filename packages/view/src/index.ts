/**
 * `@inkbrick/view`: ядро интерфейса редактора без фреймворка — связь модели с DOM (`EditorView`), чтение и установка
 * выделения, обработка `beforeinput`, отрисовка строчного текста и контроллеры состояния интерфейса (slash-меню, панель
 * форматирования, контекстное меню, поиск, палитра, сворачивание, выбор блоков). `@inkbrick/react` — обёртка над ним;
 * обёртка для другого фреймворка берёт отсюда всё, кроме компонентов.
 */

export { BlockHandleController } from './block-handle/BlockHandleController';
export type {
  BlockAnchor,
  BlockHandleState,
  DragState,
  DropIndicatorRect,
  DropPosition,
  DropSide,
} from './block-handle/BlockHandleController';
export { ContextMenuController } from './context-menu/ContextMenuController';
export type { ContextMenuState } from './context-menu/ContextMenuController';
export { BlockSelectionController } from './editing/BlockSelectionController';
export { CaretController } from './editing/CaretController';
export { CellSelectionController } from './editing/CellSelectionController';
export type { CellSelection } from './editing/CellSelectionController';
export { EditorView } from './editing/EditorView';
export type { EditorViewOptions } from './editing/EditorView';
export { FoldController } from './editing/FoldController';
export { PickedBlocksController } from './editing/PickedBlocksController';
export type { PickedState } from './editing/PickedBlocksController';
export { ViewportController } from './editing/ViewportController';
export { applyBeforeInput } from './editing/beforeInput';
export { deleteForwardAtEnd, unfoldNeighbour } from './editing/deleteAtBoundary';
export { highlightsSupported, setHighlight } from './editing/highlights';
export { createInputActions } from './editing/inputActions';
export type { InputActions } from './editing/inputActions';
export { normalizeTokens, renderCode } from './editing/renderCode';
export { renderInline } from './editing/renderInline';
export type { RenderInlineOptions } from './editing/renderInline';
export {
  findPoint,
  getOffsetIn,
  readDocSelection,
  selectAllText,
  setDomSelection,
} from './editing/selection';
export type { DocPoint, DocSelection } from './editing/selection';
export {
  FindController,
  HIGHLIGHT,
  HIGHLIGHT_CURRENT,
  getFindController,
} from './find/FindController';
export type { FindState } from './find/FindController';
export { FormulaController } from './formula/FormulaController';
export type { FormulaEditorMode, FormulaEditorState } from './formula/FormulaController';
export {
  applyInlineFormula,
  matchInlineFormula,
  openFormulaAt,
  openInlineFormula,
} from './formula/actions';
export { ImageError, formatImageError, toImageErrorInfo } from './images/ImageError';
export type { ImageErrorCode, ImageErrorInfo } from './images/ImageError';
export { UploadTracker } from './images/UploadTracker';
export { ensureMathStyles, mountFormula, temmlRenderer } from './math/renderer';
export type {
  FormulaRenderOptions,
  FormulaRenderer,
  FormulaState,
  MountFormulaOptions,
} from './math/renderer';
export { PaletteController, getPaletteController } from './palette/PaletteController';
export type { PaletteState } from './palette/PaletteController';
export { SlashMenuController } from './slash/SlashMenuController';
export type { SlashMenuState } from './slash/SlashMenuController';
export { filterSlashItems } from './slash/filter';
export { SLASH_GROUPS, orderByGroup } from './slash/groups';
export { availableSlashItems, visibleSlashItems } from './slash/items';
export { syncSlashMenu } from './slash/syncSlashMenu';
export type { SlashMenuItem, SlashRunContext } from './slash/types';
export { wordAt } from './spellcheck/types';
export type { SpellTarget, Spellchecker } from './spellcheck/types';
export { ToolbarController } from './toolbar/ToolbarController';
export type { ToolbarState } from './toolbar/ToolbarController';
export { isFormattable, setLinkInSelection, toggleFormatInSelection } from './toolbar/formatting';
export type { InlineFormat, ToolbarPanel } from './toolbar/types';
