import type { Document } from '../document';
import type { BaseBlock, InlineNode } from '../model';
import { exportColor } from '../utils/colors';
import { isFormulaNode } from '../utils/formula';
import { isSafeImageUrl, isSafeUrl } from '../utils/url';
import {
  buildExportTree,
  groupSiblings,
  headingLevel,
  isOrdered,
  isTodo,
  stringProp,
  type ExportNode,
  type ExportOptions,
} from './tree';

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ALIGNED = new Set(['center', 'right', 'justify']);

function alignStyle(block: BaseBlock): string {
  const align = block.props.alignment ?? block.props.align;

  return typeof align === 'string' && ALIGNED.has(align) ? ` style="text-align:${align}"` : '';
}

function inlineToHtml(nodes: readonly InlineNode[], inCode = false): string {
  return nodes
    .map((node) => {
      const { insert, attributes } = node;

      // Встроенная формула: `<span class="math inline">\(…\)</span>` — как у pandoc, подхватывается KaTeX/MathJax.
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

      return `<pre><code${attribute}>${inlineToHtml(block.content, true)}</code></pre>`;
    }
    case 'block:divider':
      return '<hr>';
    case 'block:formula': {
      const latex = escapeHtml(stringProp(block, 'latex'));

      return latex === '' ? '' : `<div class="math display">\\[${latex}\\]</div>`;
    }
    case 'block:image': {
      const src = stringProp(block, 'src');
      const caption = stringProp(block, 'caption');

      if (!isSafeImageUrl(src)) return caption ? `<p>${escapeHtml(caption)}</p>` : '';

      const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(stringProp(block, 'alt'))}">`;

      return caption
        ? `<figure>${img}<figcaption>${escapeHtml(caption)}</figcaption></figure>`
        : `<figure>${img}</figure>`;
    }
    default:
      return `<p${alignStyle(block)}>${text}</p>`;
  }
}

function renderGroups(nodes: readonly ExportNode[]): string {
  return groupSiblings(nodes)
    .map((group) => {
      if (!group.list) {
        const { block, children } = group.nodes[0];

        return renderBlock(block) + renderGroups(children);
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

            return `<li${alignStyle(block)}>${checkbox}${inlineToHtml(block.content)}${renderGroups(children)}</li>`;
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
 * HTML-фрагмент (без `<html>`/`<body>`): семантические теги без классов и стилей, кроме выравнивания.
 * Весь текст и атрибуты экранируются, небезопасные ссылки и адреса картинок отбрасываются.
 */
export function toHtml(document: Document, options: ExportOptions = {}): string {
  const { nodes, title } = buildExportTree(document, options);
  const body = renderGroups(nodes);

  return title ? `<h1>${escapeHtml(title)}</h1>\n${body}` : body;
}
