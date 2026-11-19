import { useState } from 'react';

import {
  COLOR_NAMES,
  TABLE_STYLES,
  type BaseBlock,
  type ColorName,
  type TableBorderWidth,
  type TableProps,
  type TableStyle,
} from '@inkbrick/document';
import { TABLE_BORDER_MODES, type Editor, type TableBorderMode } from '@inkbrick/engine';

import type { BlockMenuPanel } from '../block-handle/types';
import type { CellSelection } from '../editing/CellSelectionController';
import type { TFunction } from '../i18n/translate';
import { useT } from '../hooks/useT';
import type { MessageKey } from '../i18n/en';
import { backgroundTarget } from './tableFormatActions';

const WIDTHS = ['thin', 'medium', 'thick'] as const satisfies readonly TableBorderWidth[];

/** Живой стиль таблицы: наведение показывает его на самой таблице, пока он не выбран. */
function setPreview(blockId: string, style: TableStyle | null) {
  const table = document.querySelector<HTMLElement>(
    `[data-inkbrick-block="table"][data-block-id="${CSS.escape(blockId)}"]`,
  );

  if (!table) return;

  if (style === null) {
    if (table.dataset.previousStyle !== undefined) {
      if (table.dataset.previousStyle === '') delete table.dataset.tableStyle;
      else table.dataset.tableStyle = table.dataset.previousStyle;
      delete table.dataset.previousStyle;
    }
    return;
  }

  if (table.dataset.previousStyle === undefined) {
    table.dataset.previousStyle = table.dataset.tableStyle ?? '';
  }

  table.dataset.tableStyle = style;
}

/** Миниатюра стиля: сетка из пустых клеток 3 × 4; красят её те же токены стиля, что и настоящую таблицу. */
function StylePreview({
  style,
  header,
  striped,
}: {
  style: TableStyle;
  header: boolean;
  striped: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-inkbrick-part="style-preview"
      data-table-style={style === 'plain' ? undefined : style}
      data-header={header || undefined}
      data-striped={striped || undefined}
    >
      {[0, 1, 2, 3].flatMap((row) =>
        [0, 1, 2].map((column) => (
          <span key={`${row}-${column}`} data-inkbrick-part="preview-cell" data-row={row} />
        )),
      )}
    </span>
  );
}

/** Линии значка границ: сетка 2 × 2 в поле 20 × 20 (внешняя рамка и по одной внутренней линии). */
const GLYPH_LINES = [
  ['top', 3, 3, 17, 3],
  ['bottom', 3, 17, 17, 17],
  ['left', 3, 3, 3, 17],
  ['right', 17, 3, 17, 17],
  ['h', 3, 10, 17, 10],
  ['v', 10, 3, 10, 17],
] as const;

const GLYPH_MODES: Readonly<Record<TableBorderMode, readonly string[]>> = {
  all: ['top', 'bottom', 'left', 'right', 'h', 'v'],
  outside: ['top', 'bottom', 'left', 'right'],
  inside: ['h', 'v'],
  insideHorizontal: ['h'],
  insideVertical: ['v'],
  top: ['top'],
  bottom: ['bottom'],
  left: ['left'],
  right: ['right'],
  none: [],
};

/**
 * Значок режима границ: бледная сетка 3 × 3 и поверх неё яркими линиями те, что меняет пункт. «Нет границы» — только
 * бледная сетка с косой чертой.
 */
function BorderGlyph({ mode }: { mode: TableBorderMode }) {
  const active = new Set(GLYPH_MODES[mode]);

  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="1" opacity="0.3" strokeLinecap="round">
        {GLYPH_LINES.map(([name, x1, y1, x2, y2]) => (
          <line key={name} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
        {GLYPH_LINES.filter(([name]) => active.has(name)).map(([name, x1, y1, x2, y2]) => (
          <line key={name} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      {mode === 'none' && (
        <line
          x1="4"
          y1="16"
          x2="16"
          y2="4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function StyleGallery({
  editor,
  block,
  run,
}: {
  editor: Editor;
  block: BaseBlock;
  run: (action: () => void) => void;
}) {
  const t = useT();
  const props = block.props as TableProps;
  const current: TableStyle = props.tableStyle ?? 'plain';

  return (
    <div
      data-inkbrick-part="style-gallery"
      role="group"
      aria-label={t('table.style.heading')}
      onPointerLeave={() => setPreview(block.id, null)}
    >
      {TABLE_STYLES.map((style) => (
        <button
          key={style}
          type="button"
          role="menuitemradio"
          aria-checked={current === style}
          data-inkbrick-part="style-option"
          data-action={`table-style-${style}`}
          aria-label={t(`table.style.${style}` as MessageKey)}
          title={t(`table.style.${style}` as MessageKey)}
          onPointerEnter={() => setPreview(block.id, style)}
          onFocus={() => setPreview(block.id, style)}
          onBlur={() => setPreview(block.id, null)}
          onClick={() => {
            setPreview(block.id, null);
            run(() =>
              editor.dispatch({
                type: 'setBlockProps',
                payload: {
                  blockId: block.id,
                  props: { tableStyle: style === 'plain' ? undefined : style },
                },
              }),
            );
          }}
        >
          <StylePreview style={style} header={props.header !== false} striped={style !== 'plain'} />
        </button>
      ))}
    </div>
  );
}

function BordersPanel({
  editor,
  block,
  picked,
  run,
}: {
  editor: Editor;
  block: BaseBlock;
  picked: CellSelection | null;
  run: (action: () => void) => void;
}) {
  const t = useT();
  const [width, setWidth] = useState<TableBorderWidth>('thin');
  const [color, setColor] = useState<ColorName | null>(null);

  const apply = (mode: TableBorderMode) => {
    const target = backgroundTarget(editor, block, picked);

    if (!target) return;

    run(() =>
      editor.dispatch({
        type: 'setTableCellsBorders',
        payload: { blockId: block.id, range: target.range, mode, width, color },
      } as never),
    );
  };

  return (
    <div data-inkbrick-part="borders">
      <div data-inkbrick-part="border-modes" role="group" aria-label={t('table.border.heading')}>
        {TABLE_BORDER_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="menuitem"
            data-inkbrick-part="border-mode"
            data-action={`table-border-${mode}`}
            aria-label={t(`table.border.${mode}` as MessageKey)}
            title={t(`table.border.${mode}` as MessageKey)}
            onClick={() => apply(mode)}
          >
            <BorderGlyph mode={mode} />
          </button>
        ))}
      </div>
      <div data-inkbrick-part="border-widths" role="group" aria-label={t('table.border.width')}>
        {WIDTHS.map((value) => (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            aria-checked={width === value}
            data-inkbrick-part="border-width"
            data-width={value}
            data-action={`table-border-width-${value}`}
            aria-label={t(`table.border.${value}` as MessageKey)}
            title={t(`table.border.${value}` as MessageKey)}
            onClick={() => setWidth(value)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      <div data-inkbrick-part="border-colors" role="group" aria-label={t('table.border.color')}>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={color === null}
          data-inkbrick-part="border-color"
          data-color=""
          data-action="table-border-color-default"
          aria-label={t('table.border.colorDefault')}
          title={t('table.border.colorDefault')}
          onClick={() => setColor(null)}
        />
        {COLOR_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            role="menuitemradio"
            aria-checked={color === name}
            data-inkbrick-part="border-color"
            data-color={name}
            data-action={`table-border-color-${name}`}
            aria-label={t(`color.${name}` as MessageKey)}
            title={t(`color.${name}` as MessageKey)}
            onClick={() => setColor(name)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Секции меню таблицы: галерея готовых стилей (наведение показывает стиль на самой таблице) и границы ячеек
 * (все, внешние, внутренние, по сторонам, без границ) с толщиной и цветом линии. Границы относятся к выделенным ячейкам,
 * а без выделения — ко всей таблице.
 */
export function tableDesignPanels(
  editor: Editor,
  block: BaseBlock,
  t: TFunction,
  picked: CellSelection | null,
  run: (action: () => void) => void,
): BlockMenuPanel[] {
  return [
    {
      id: 'table-style',
      title: t('table.style.heading'),
      content: <StyleGallery editor={editor} block={block} run={run} />,
    },
    {
      id: 'table-border-lines',
      title: t('table.border.heading'),
      content: <BordersPanel editor={editor} block={block} picked={picked} run={run} />,
    },
  ];
}
