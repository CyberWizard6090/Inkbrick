import type { Document } from '../document';
import { toHtml } from './html';
import { toMarkdown } from './markdown';
import { toPlainText } from './plainText';
import type { ExportOptions } from './tree';

export { toPlainText } from './plainText';
export { toMarkdown } from './markdown';
export { toHtml } from './html';
export type { ExportOptions } from './tree';

export type ExportFormat = 'text' | 'markdown' | 'html';

const EXPORTERS: Record<ExportFormat, (document: Document, options?: ExportOptions) => string> = {
  text: toPlainText,
  markdown: toMarkdown,
  html: toHtml,
};

export function exportDocument(
  document: Document,
  format: ExportFormat,
  options?: ExportOptions,
): string {
  const exporter = EXPORTERS[format];

  if (!exporter) throw new Error(`Unknown export format "${String(format)}"`);

  return exporter(document, options);
}
