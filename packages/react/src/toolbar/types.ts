import type { Alignment } from '@inkbrick/document';
import type { RangeFormats } from '@inkbrick/engine';

export type InlineFormat = 'bold' | 'italic' | 'underline' | 'strike' | 'code';

export type ToolbarPanel = 'color' | 'highlight';

export interface ToolbarProps {
  readonly formats: RangeFormats;
  readonly position: { readonly x: number; readonly y: number };
  readonly linkOpen: boolean;
  readonly onToggle: (format: InlineFormat) => void;
  readonly onOpenLink: () => void;
  readonly onApplyLink: (url: string | null) => boolean;
  readonly onCancelLink: () => void;
  readonly panel: ToolbarPanel | null;
  readonly onTogglePanel: (panel: ToolbarPanel) => void;
  readonly onApplyColor: (kind: 'color' | 'backgroundColor', value: string | null) => void;
  readonly onAlign: (align: Alignment) => void;
  readonly onInsertFormula: () => void;
}
