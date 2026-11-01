export * from './model';
export { Document } from './document';
export * from './schema';
export { createDocument } from './createDocument';
export { toPlainText, toMarkdown, toHtml, exportDocument } from './adapters';
export type { ExportOptions, ExportFormat } from './adapters';
export type { CreateDocumentOptions } from './createDocument';
export * from './utils/InlineNodeUtils';
export { createId } from './utils/id';
export { COLOR_NAMES, COLOR_HEX, isColorName, safeCssColor, exportColor } from './utils/colors';
export type { ColorName } from './utils/colors';
export { ALIGNMENTS, isAlignment, isAlignable, getBlockAlign, alignProps } from './utils/align';
export type { Alignment } from './utils/align';
export { FORMULA_CHAR, MAX_FORMULA_LENGTH, isFormulaNode } from './utils/formula';
export { MAX_NESTING_DEPTH } from './utils/nesting';
export { isSafeUrl, normalizeLinkUrl, isSafeImageUrl, MAX_DATA_IMAGE_LENGTH } from './utils/url';
export {
  serializeDocument,
  deserializeDocument,
  validateSnapshot,
  migrateSnapshot,
  DocumentValidationError,
} from './serialization/serialize';
export type { DeserializeOptions } from './serialization/serialize';
export { repairSnapshot } from './serialization/repair';
export type { RepairResult } from './serialization/repair';

/*
 * Единый экземпляр zod для авторов пользовательских блоков: не нужно добавлять свою зависимость
 * и следить за совпадением версий со схемами Inkbrick.
 */
export { z } from 'zod';
