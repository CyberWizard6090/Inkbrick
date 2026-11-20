import type { Document } from '../document';
import type { BaseBlock, InlineNode } from '../model';
import { exportColor, getBlockBackgroundColor, isHexColor } from '../utils/colors';
import { isFootnoteNode } from '../utils/footnote';
import { isFormulaNode } from '../utils/formula';
import { IMAGE_ASPECTS } from '../schema/blocks/ImageSchema';
import { TABLE_CELL } from '../schema/blocks/TableSchema';
import { isSafeImageUrl, isSafeUrl } from '../utils/url';
import {
  buildExportTree,
  collectHeadings,
  exportTable,
  footnoteLabel,
  groupSiblings,
  headingLevel,
  isOrdered,
  isToc,
  isTodo,
  stringProp,
  tocOutline,
  type ExportNode,
  type ExportOptions,
  type OutlineItem,
} from './tree';

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ALIGNED = new Set(['center', 'right', 'justify']);

/** Фон ячейки таблицы: насыщенные цвета (как `--inkbrick-cell-*` в стилях), одинаковые в обеих темах. */
const CELL_HEX: Readonly<Record<string, string>> = {
  gray: '#9ca3af',
  brown: '#a16207',
  orange: '#f97316',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  red: '#ef4444',
  lime: '#84cc16',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  indigo: '#6366f1',
  magenta: '#d946ef',
};

/** Чёрный или белый текст на фоне `#rrggbb` — тот, что контрастнее (относительная яркость WCAG). */
function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;

    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179 ? '#ffffff' : '#1a1a1a';
}

/** `style` блока: выравнивание и фон (оттенок светлой темы: в экспорте переменных темы нет). */
function alignStyle(block: BaseBlock, extra: readonly string[] = []): string {
  const align = block.props.alignment ?? block.props.align;
  const color = getBlockBackgroundColor(block);
  // У ячейки таблицы фон непрозрачный и насыщенный, текст на нём по контрасту — как в редакторе. Свой цвет блока — с той же
  // прозрачностью 35%, что и в редакторе (там он разбавлен, чтобы текст оставался читаемым).
  const cell =
    block.flavour === TABLE_CELL && color
      ? isHexColor(color)
        ? color
        : CELL_HEX[color]
      : undefined;
  const background = cell
    ? `${cell};color:${textOn(cell)}`
    : isHexColor(color)
      ? `${color}59`
      : exportColor(color, 'background');
  const style = [
    typeof align === 'string' && ALIGNED.has(align) && `text-align:${align}`,
    background && `background-color:${background}`,
    ...extra,
  ].filter(Boolean);

  return style.length > 0 ? ` style="${style.join(';')}"` : '';
}

const BORDER_PX = { thin: '1px', medium: '2px', thick: '3px' } as const;

/** Границы ячейки в `style`: толщина и цвет (оттенок светлой темы) по сторонам; «без линии» — `none`. */
/** Линия по умолчанию у ячейки таблицы в редакторе (`--inkbrick-stroke-2`, светлая тема). */
const DEFAULT_CELL_LINE = '#e9e9e7';

function borderStyle(cell: BaseBlock, defaults = false): string[] {
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  const key = (side: (typeof sides)[number]) => `border${side[0].toUpperCase()}${side.slice(1)}`;
  // Цвет и начертание стороны: свои у стороны, иначе общие на ячейку (сплошная, прерывистая или точками — как в редакторе).
  const look = (side: (typeof sides)[number]) => {
    const style = cell.props[`${key(side)}Style`] ?? cell.props.borderStyle;
    const color = cell.props[`${key(side)}Color`] ?? cell.props.borderColor;

    return {
      line: style === 'dashed' || style === 'dotted' ? style : 'solid',
      color: exportColor(color, 'text') ?? undefined,
    };
  };
  const plain = (side: (typeof sides)[number]) =>
    !['none', 'thin', 'medium', 'thick'].includes(String(cell.props[key(side)])) &&
    look(side).color === undefined &&
    look(side).line === 'solid';

  // Все четыре стороны без своих линий и оформления: одна запись вместо четырёх.
  if (defaults && sides.every(plain)) return [`border:1px solid ${DEFAULT_CELL_LINE}`];

  return sides.flatMap((side) => {
    const width = cell.props[key(side)];
    const { line, color } = look(side);

    if (width === 'none') return [`border-${side}:none`];

    if (width === 'thin' || width === 'medium' || width === 'thick')
      return [`border-${side}:${BORDER_PX[width]} ${line} ${color ?? '#bdbdbd'}`];

    // Сторона без своей толщины: в редакторе она рисуется линией таблицы по умолчанию (своего цвета, если он задан).
    if (!defaults) return [];

    return [`border-${side}:1px ${line} ${color ?? DEFAULT_CELL_LINE}`];
  });
}

/** Кадрирование картинки как `style`: пропорции кадра и положение (масштаб в HTML не передаётся, нужен стиль страницы). */
function cropStyle(block: BaseBlock): string {
  const aspect = block.props.aspect;
  const x = Number(block.props.cropX);
  const y = Number(block.props.cropY);
  const ratio = typeof aspect === 'string' ? aspect : 'auto';

  if (!(IMAGE_ASPECTS as readonly string[]).includes(ratio) || ratio === 'auto') return '';

  const position =
    Number.isFinite(x) && Number.isFinite(y)
      ? `;object-position:${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`
      : '';

  return ` style="aspect-ratio:${ratio.replace(':', '/')};object-fit:cover;width:100%${position}"`;
}

function inlineToHtml(nodes: readonly InlineNode[], inCode = false): string {
  return nodes
    .map((node) => {
      const { insert, attributes } = node;

      // Встроенная формула: `<span class="math inline">\(…\)</span>` — как у pandoc, подхватывается KaTeX/MathJax.
      if (isFootnoteNode(node)) {
        const id = String(attributes!.footnote);

        return `<sup><a href="#fn-${id}">${footnoteLabel(id)}</a></sup>`.repeat(insert.length);
      }

      if (isFormulaNode(node)) {
        const latex = escapeHtml(String(attributes!.formula));

        return latex === ''
          ? ''
          : `<span class="math inline">\\(${latex}\\)</span>`.repeat(insert.length);
      }

      let html = escapeHtml(insert).replace(/\n/g, inCode ? '\n' : '<br>');

      if (!attributes) return html;

      if (attributes.code && !inCode) html = `<code>${html}</code>`;
      if (attributes.bold) html = `<strong>${html}</strong>`;
      if (attributes.italic) html = `<em>${html}</em>`;
      if (attributes.underline) html = `<u>${html}</u>`;
      if (attributes.strike) html = `<s>${html}</s>`;

      if (typeof attributes.link === 'string' && isSafeUrl(attributes.link)) {
        html = `<a href="${escapeHtml(attributes.link)}" rel="noopener noreferrer">${html}</a>`;
      }

      const color = exportColor(attributes.color, 'text');
      const background = exportColor(attributes.backgroundColor, 'background');

      if (color || background) {
        const style = [color && `color:${color}`, background && `background-color:${background}`]
          .filter(Boolean)
          .join(';');

        html = `<span style="${style}">${html}</span>`;
      }

      return html;
    })
    .join('');
}

const TONES = new Set(['info', 'warning', 'success', 'danger']);

function renderBlock(block: BaseBlock): string {
  const text = inlineToHtml(block.content);

  switch (block.flavour) {
    case 'block:heading': {
      const level = headingLevel(block);

      return `<h${level}${alignStyle(block)}>${text}</h${level}>`;
    }
    case 'block:quote':
      return `<blockquote${alignStyle(block)}>${text}</blockquote>`;
    case 'block:callout': {
      const tone = stringProp(block, 'tone', 'info');
      const icon = stringProp(block, 'icon');
      const prefix = icon ? `<span aria-hidden="true">${escapeHtml(icon)}</span> ` : '';

      return `<aside data-callout="${TONES.has(tone) ? tone : 'info'}"${alignStyle(block)}>${prefix}${text}</aside>`;
    }
    case 'block:code': {
      const language = stringProp(block, 'language', 'plain').replace(/[^\w+#.-]/g, '');
      const attribute = language && language !== 'plain' ? ` class="language-${language}"` : '';

      const pre = `<pre><code${attribute}>${inlineToHtml(block.content, true)}</code></pre>`;
      const caption = stringProp(block, 'caption');

      return caption
        ? `<figure>${pre}<figcaption>${escapeHtml(caption)}</figcaption></figure>`
        : pre;
    }
    case 'block:divider':
      return '<hr>';
    case 'block:footnote': {
      const id = stringProp(block, 'id').replace(/[^\w-]/g, '');
      const label = footnoteLabel(id);

      return `<aside id="fn-${id}" data-footnote="${label}"><sup>${label}</sup> ${text}</aside>`;
    }
    case 'block:formula': {
      const latex = escapeHtml(stringProp(block, 'latex'));

      return latex === '' ? '' : `<div class="math display">\\[${latex}\\]</div>`;
    }
    case 'block:image': {
      const src = stringProp(block, 'src');
      const caption = stringProp(block, 'caption');

      if (!isSafeImageUrl(src)) return caption ? `<p>${escapeHtml(caption)}</p>` : '';

      const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(stringProp(block, 'alt'))}"${cropStyle(block)}>`;

      return caption
        ? `<figure>${img}<figcaption>${escapeHtml(caption)}</figcaption></figure>`
        : `<figure>${img}</figure>`;
    }
    default:
      return `<p${alignStyle(block)}>${text}</p>`;
  }
}

function renderTable(node: ExportNode): string {
  const {
    header,
    headerColumn,
    striped,
    borders,
    rows,
    widths,
    merges: wholeMerges,
  } = exportTable(node);

  if (rows.length === 0) return '';

  // `rowspan` не может пересечь границу `thead` и `tbody`: объединение из строки заголовка обрезается по ней.
  const merges = header
    ? wholeMerges.map((merge) =>
        merge.row < 1 && merge.row + merge.rows > 1 ? { ...merge, rows: 1 } : merge,
      )
    : wholeMerges;

  const cellHtml = (
    cell: BaseBlock | undefined,
    tag: 'td' | 'th',
    rowIndex: number,
    columnIndex: number,
  ) => {
    const found = merges.find(
      (merge) =>
        rowIndex >= merge.row &&
        rowIndex < merge.row + merge.rows &&
        columnIndex >= merge.column &&
        columnIndex < merge.column + merge.columns,
    );

    if (found && (found.row !== rowIndex || found.column !== columnIndex)) return '';

    const spans =
      (found && found.columns > 1 ? ` colspan="${found.columns}"` : '') +
      (found && found.rows > 1 ? ` rowspan="${found.rows}"` : '');

    // Заголовочный столбец в теле таблицы — `<th scope="row">`.
    const rowHeader = headerColumn && columnIndex === 0 && tag === 'td';
    const name = rowHeader ? 'th' : tag;
    const scope = rowHeader ? ' scope="row"' : '';

    return `<${name}${scope}${spans}${cell ? alignStyle(cell, borderStyle(cell, borders !== false)) : ''}>${inlineToHtml(cell?.content ?? [])}</${name}>`;
  };
  const row = (cells: readonly (BaseBlock | undefined)[], tag: 'td' | 'th', rowIndex: number) => {
    // Полосатость: каждая вторая строка тела; цвет светлой темы, потому что стилей темы в экспорте нет.
    const band = striped && tag === 'td' && (rowIndex - (header ? 1 : 0)) % 2 === 1;

    return `<tr${band ? ' style="background-color:#f4f4f4"' : ''}>${cells.map((cell, columnIndex) => cellHtml(cell, tag, rowIndex, columnIndex)).join('')}</tr>`;
  };
  const columns = widths.some((width) => width !== null)
    ? `<colgroup>${widths
        .map((width) => (width === null ? '<col>' : `<col style="width:${width}px">`))
        .join('')}</colgroup>`
    : '';
  const head = header ? `<thead>${row(rows[0], 'th', 0)}</thead>` : '';
  const offset = header ? 1 : 0;
  const body = rows
    .slice(offset)
    .map((cells, index) => row(cells, 'td', index + offset))
    .join('');

  const attributes = (borders ? '' : ' data-borders="none"') + (striped ? ' data-striped' : '');

  return `<table${attributes}>${columns}${head}<tbody>${body}</tbody></table>`;
}

function renderOutline(items: readonly OutlineItem[]): string {
  if (items.length === 0) return '';

  const list = items
    .map(
      ({ block, children }) => `<li>${inlineToHtml(block.content)}${renderOutline(children)}</li>`,
    )
    .join('');

  return `<ul>${list}</ul>`;
}

function renderGroups(nodes: readonly ExportNode[], headings: readonly BaseBlock[] = []): string {
  return groupSiblings(nodes)
    .map((group) => {
      if (!group.list) {
        const { block, children } = group.nodes[0];

        // Потомки таблицы — её строки и ячейки, они выведены вместе с ней.
        if (block.flavour === 'block:table') return renderTable(group.nodes[0]);

        if (isToc(block)) {
          const outline = renderOutline(tocOutline(headings, block));

          return outline === '' ? '' : `<nav>${outline}</nav>`;
        }

        if (block.flavour === 'block:toggle') {
          const open = block.props.open === false ? '' : ' open';

          return `<details${open}><summary>${inlineToHtml(block.content)}</summary>${renderGroups(children, headings)}</details>`;
        }

        return renderBlock(block) + renderGroups(children, headings);
      }

      let html = '';

      for (let i = 0; i < group.nodes.length;) {
        const ordered = isOrdered(group.nodes[i].block);
        let j = i + 1;

        while (j < group.nodes.length && isOrdered(group.nodes[j].block) === ordered) j++;

        const items = group.nodes
          .slice(i, j)
          .map(({ block, children }) => {
            const checkbox = isTodo(block)
              ? `<input type="checkbox" disabled${block.props.checked === true ? ' checked' : ''}> `
              : '';

            return `<li${alignStyle(block)}>${checkbox}${inlineToHtml(block.content)}${renderGroups(children, headings)}</li>`;
          })
          .join('');

        html += ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
        i = j;
      }

      return html;
    })
    .join('\n');
}

/**
 * HTML-фрагмент (без `<html>`/`<body>`): семантические теги без классов и стилей, кроме выравнивания (и ширины
 * столбцов таблицы).
 * Весь текст и атрибуты экранируются, небезопасные ссылки и адреса картинок отбрасываются.
 */
export function toHtml(document: Document, options: ExportOptions = {}): string {
  const { nodes, title } = buildExportTree(document, options);
  const body = renderGroups(nodes, collectHeadings(nodes));

  return title ? `<h1>${escapeHtml(title)}</h1>\n${body}` : body;
}
