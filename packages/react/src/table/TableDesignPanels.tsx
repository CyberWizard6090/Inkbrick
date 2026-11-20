import { useEffect, type CSSProperties } from 'react';

import {
  BLOCK_BACKGROUNDS,
  COLOR_NAMES,
  TABLE_BORDER_STYLES,
  TABLE_STYLES,
  getBlockBackgroundColor,
  isHexColor,
  type BaseBlock,
  type ColorName,
  type TableBorderStyle,
  type TableBorderWidth,
  type TableProps,
  type TableStyle,
} from '@inkbrick/document';
import { TABLE_BORDER_MODES, type Editor, type TableBorderMode } from '@inkbrick/engine';

import type { ContextMenuItem } from '../context-menu/types';
import type { CellSelection } from '../editing/CellSelectionController';
import type { TFunction } from '../i18n/translate';
import { useT } from '../hooks/useT';
import { Icon } from '../icons/Icon';
import type { MessageKey } from '../i18n/en';
import { CustomColorSwatch } from '../ui/CustomColorSwatch';
import { backgroundCells } from './cellFormatting';
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

const GLYPH_MODES: Readonly<Record<Exclude<TableBorderMode, 'keep'>, readonly string[]>> = {
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
function BorderGlyph({ mode }: { mode: Exclude<TableBorderMode, 'keep'> }) {
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

  // Меню закрыто клавишей Escape или кликом мимо — галерея уходит без `pointerleave`: предпросмотр сбрасываем сами.
  useEffect(() => () => setPreview(block.id, null), [block.id]);

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

/**
 * Оформление линий, которое запоминается между открытиями меню: толщина, начертание и цвет, с которыми рисуются границы
 * из пунктов «Все», «Внешние» и т. д. Выбор толщины, начертания или цвета сразу меняет и уже существующие линии выделенных
 * ячеек (режим `keep`), поэтому ничего дополнительно нажимать не нужно.
 */
interface BorderLook {
  width: TableBorderWidth;
  style: TableBorderStyle;
  color: ColorName | null;
}

/** У каждого редактора своё: выбор в одном редакторе страницы не меняет линии другого. */
const looks = new WeakMap<Editor, BorderLook>();

function lookOf(editor: Editor): BorderLook {
  let look = looks.get(editor);

  if (!look) {
    look = { width: 'thin', style: 'solid', color: null };
    looks.set(editor, look);
  }

  return look;
}

/** Меняет границы выделенных ячеек (а без выделения — всей таблицы) и запоминает выбранное оформление. */
function applyBorders(
  editor: Editor,
  block: BaseBlock,
  picked: CellSelection | null,
  run: (action: () => void) => void,
  change: {
    mode: TableBorderMode;
    width?: TableBorderWidth;
    color?: ColorName | null;
    style?: TableBorderStyle;
  },
) {
  const target = backgroundTarget(editor, block, picked);

  if (!target) return;

  run(() =>
    editor.dispatch({
      type: 'setTableCellsBorders',
      payload: { blockId: block.id, range: target.range, ...change },
    } as never),
  );
}

/** Образец линии для пунктов толщины и начертания. */
function LineSample({ width, style }: { width?: TableBorderWidth; style?: TableBorderStyle }) {
  const px = width === 'thick' ? 3 : width === 'medium' ? 2 : 1;

  return (
    <span
      aria-hidden="true"
      data-inkbrick-part="line-sample"
      style={{ borderTopWidth: px, borderTopStyle: style ?? 'solid' }}
    />
  );
}

/**
 * Круглые образцы цвета с кнопкой «Убрать цвет» сверху; при `custom` внизу есть «+» для своего цвета. Общие для фона ячейки и
 * цвета границ. `current` — выбранный сейчас цвет (`null` — нет цвета).
 */
function ColorDots({
  names,
  current,
  custom,
  onPick,
}: {
  names: readonly string[];
  current: string | null;
  custom: boolean;
  onPick: (color: string | null) => void;
}) {
  const t = useT();

  return (
    <div data-inkbrick-part="dot-panel">
      <button
        type="button"
        role="menuitemradio"
        aria-checked={current === null}
        data-inkbrick-part="dot-remove"
        data-action="color-remove"
        onClick={() => onPick(null)}
      >
        <span aria-hidden="true" data-inkbrick-part="none-mark" />
        {t('color.remove')}
      </button>
      <div data-inkbrick-part="dots" role="group">
        {names.map((name) => (
          <button
            key={name}
            type="button"
            role="menuitemradio"
            aria-checked={current === name}
            data-inkbrick-part="dot"
            data-color={name}
            data-action={`color-${name}`}
            aria-label={t(`color.${name}` as MessageKey)}
            title={t(`color.${name}` as MessageKey)}
            style={{ '--inkbrick-dot': `var(--inkbrick-highlight-${name})` } as CSSProperties}
            onClick={() => onPick(name)}
          />
        ))}
        {custom && (
          <CustomColorSwatch
            value={isHexColor(current) ? current : undefined}
            fallback="#ffe74a"
            label={t('color.custom')}
            pressed={isHexColor(current)}
            onPick={(hex) => onPick(hex)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Пункты контекстного меню ячейки с вложенными меню, как в офисных редакторах: «Фон ячейки» (палитра), «Границы ячеек»
 * (расположение линий, а в нём «Толщина», «Стиль» и «Цвет границ») и «Стиль таблицы» (галерея). Действие закрывает меню.
 */
export function tableDesignMenuItems(
  editor: Editor,
  block: BaseBlock,
  t: TFunction,
  picked: CellSelection | null,
  run: (action: () => void) => void,
): ContextMenuItem[] {
  const target = backgroundTarget(editor, block, picked);

  if (!target) return [];

  const backgrounds = new Set(
    [...target.ids].map((id) => {
      const cell = editor.store.getBlock(id);

      return cell ? getBlockBackgroundColor(cell) : undefined;
    }),
  );
  const currentBackground = backgrounds.size === 1 ? ([...backgrounds][0] ?? null) : null;
  const apply = (change: Parameters<typeof applyBorders>[4]) =>
    applyBorders(editor, block, picked, run, change);
  const change = (patch: {
    width?: TableBorderWidth;
    style?: TableBorderStyle;
    color?: ColorName | null;
  }) => {
    Object.assign(lookOf(editor), patch);
    apply({ mode: 'keep', ...patch });
  };

  return [
    {
      id: 'table-cell-background',
      title: t('table.format.cellsBackground'),
      icon: <Icon name="palette" />,
      separatorBefore: true,
      flyout: (
        <ColorDots
          names={BLOCK_BACKGROUNDS}
          current={currentBackground}
          custom
          onPick={(color) => run(() => void backgroundCells(editor, target, color))}
        />
      ),
      run: () => undefined,
    },
    {
      id: 'table-cell-borders',
      title: t('table.border.cells'),
      icon: <Icon name="table" />,
      submenu: [
        ...TABLE_BORDER_MODES.map((mode): ContextMenuItem => ({
          id: `table-border-${mode}`,
          title: t(`table.border.${mode}` as MessageKey),
          icon: <BorderGlyph mode={mode} />,
          run: () =>
            apply({
              mode,
              ...(mode === 'none' ? {} : { width: lookOf(editor).width }),
              color: lookOf(editor).color,
              style: lookOf(editor).style,
            }),
        })),
        {
          id: 'table-border-widthMenu',
          title: t('table.border.widthMenu'),
          icon: <LineSample width="medium" />,
          separatorBefore: true,
          submenu: WIDTHS.map((value): ContextMenuItem => ({
            id: `table-border-width-${value}`,
            title: t(`table.border.${value}` as MessageKey),
            icon: <LineSample width={value} />,
            checked: lookOf(editor).width === value,
            run: () => change({ width: value }),
          })),
          run: () => undefined,
        },
        {
          id: 'table-border-styleMenu',
          title: t('table.border.styleMenu'),
          icon: <LineSample style="dashed" />,
          submenu: TABLE_BORDER_STYLES.map((value): ContextMenuItem => ({
            id: `table-border-style-${value}`,
            title: t(`table.border.${value}` as MessageKey),
            icon: <LineSample style={value} />,
            checked: lookOf(editor).style === value,
            run: () => change({ style: value }),
          })),
          run: () => undefined,
        },
        {
          id: 'table-border-colorMenu',
          title: t('table.border.colorMenu'),
          icon: <Icon name="palette" />,
          flyout: (
            <ColorDots
              names={COLOR_NAMES}
              current={lookOf(editor).color}
              custom={false}
              onPick={(color) => change({ color: color as ColorName | null })}
            />
          ),
          run: () => undefined,
        },
      ],
      run: () => undefined,
    },
    {
      id: 'table-style',
      title: t('table.style.heading'),
      icon: <Icon name="table" />,
      flyout: <StyleGallery editor={editor} block={block} run={run} />,
      run: () => undefined,
    },
  ];
}
