import { getBlockAlign, type Alignment } from '@inkbrick/document';

import type { Editor } from './editor/Editor';
import { orderRange, textSegments, type BlockPoint } from './utils';

export interface RangeFormats {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike: boolean;
  readonly code: boolean;
  readonly link?: string;
  readonly color?: string;
  readonly backgroundColor?: string;
  /** Выравнивание, если оно одинаково у всех подходящих блоков выделения (в том числе при свёрнутом выделении). */
  readonly align?: Alignment;
}

const FORMATS = ['bold', 'italic', 'underline', 'strike', 'code'] as const;

export function getRangeFormats(editor: Editor, from: BlockPoint, to: BlockPoint): RangeFormats {
  const segments = textSegments(
    editor.store.getBlock.bind(editor.store),
    editor.document.rootId,
    editor.schema,
    from,
    to,
  );

  const result: Record<string, boolean> = {};

  for (const key of FORMATS) {
    result[key] =
      segments.length > 0 &&
      segments.every((s) => editor.engine.inline.hasFormat(s.block.content, s.start, s.end, key));
  }

  const links = new Set<string | undefined>();
  const colors = new Set<string | undefined>();
  const backgrounds = new Set<string | undefined>();
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

  for (const { block, start, end } of segments) {
    let offset = 0;

    for (const node of block.content) {
      const nodeStart = offset;
      offset += node.insert.length;

      if (offset > start && nodeStart < end) {
        links.add(text(node.attributes?.link));
        colors.add(text(node.attributes?.color));
        backgrounds.add(text(node.attributes?.backgroundColor));
      }
    }
  }

  const only = <T>(values: Set<T>): T | undefined =>
    values.size === 1 ? [...values][0] : undefined;

  const aligns = new Set<Alignment>();
  const range = orderRange(
    editor.store.getBlock.bind(editor.store),
    editor.document.rootId,
    from,
    to,
  );

  for (const block of range?.blocks ?? []) {
    const align = getBlockAlign(block);

    if (align) aligns.add(align);
  }

  const link = only(links);
  const color = only(colors);
  const backgroundColor = only(backgrounds);
  const align = only(aligns);

  return {
    ...(result as Omit<RangeFormats, 'link' | 'color' | 'backgroundColor' | 'align'>),
    ...(link ? { link } : {}),
    ...(color ? { color } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(align ? { align } : {}),
  };
}
