import type { Document } from '../document';
import type { BaseBlock, InlineNode } from '../model';
import { exportColor } from '../utils/colors';
import { alignStyle, borderStyle } from './cellStyle';
import { isFootnoteNode } from '../utils/footnote';
import { isFormulaNode } from '../utils/formula';
import { IMAGE_ASPECTS } from '../schema/blocks/ImageSchema';
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

/**
 * Обрезка картинки как `style`. Обычно `src` — уже файл обрезки, и стиль нужен только кругу. Если файла нет (обрезка
 * стилем: картинка с чужого сервера без CORS), заданная форма передаётся пропорциями кадра и положением показанной части;
 * свободная рамка без файла в HTML не передаётся.
 */
function cropStyle(block: BaseBlock): string {
  const aspect = typeof block.props.aspect === 'string' ? block.props.aspect : 'free';
  const known = (IMAGE_ASPECTS as readonly string[]).includes(aspect);
  const circle = aspect === 'circle' ? ';border-radius:50%' : '';

  if (!known || aspect === 'free' || stringProp(block, 'originalSrc') !== '') {
    return circle ? ` style="${circle.slice(1)}"` : '';
  }

  const number = (key: string, fallback: number) => {
    const value = Number(block.props[key]);

    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback;
  };
  const width = number('cropWidth', 100);
  const height = number('cropHeight', 100);
  // У `object-fit: cover` положение p% совмещает точку p% картинки с точкой p% кадра: рамка в x% при ширине w% — это
  // x / (100 − w).
  const position = (start: number, size: number) =>
    size >= 100 ? 50 : Math.round((start / (100 - size)) * 1000) / 10;
  const ratio = aspect === 'circle' ? '1/1' : aspect.replace(':', '/');

  return ` style="aspect-ratio:${ratio};object-fit:cover;width:100%;object-position:${position(number('cropX', 0), width)}% ${position(number('cropY', 0), height)}%${circle}"`;
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
