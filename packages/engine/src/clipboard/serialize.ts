import {
  exportColor,
  isFormulaNode,
  isSafeImageUrl,
  isSafeUrl,
  type InlineNode,
} from '@inkbrick/document';

import type { Fragment, FragmentBlock } from './types';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const plain = (nodes: InlineNode[]) =>
  nodes
    .map((node) =>
      isFormulaNode(node)
        ? String(node.attributes!.formula).repeat(node.insert.length)
        : node.insert,
    )
    .join('');

export function fragmentToPlainText(fragment: Fragment): string {
  const lines: string[] = [];

  const walk = (block: FragmentBlock, depth: number) => {
    if (block.flavour === 'block:image') {
      // У картинки нет текста: в простой текст идёт подпись (или описание).
      const caption = [block.props.caption, block.props.alt].find(
        (v) => typeof v === 'string' && v !== '',
      );

      if (typeof caption === 'string') lines.push(`${'  '.repeat(depth)}${caption}`);
    } else if (block.flavour === 'block:formula') {
      const latex = block.props.latex;

      if (typeof latex === 'string' && latex !== '') lines.push(`${'  '.repeat(depth)}${latex}`);
    } else if (block.flavour !== 'block:divider') {
      lines.push(`${'  '.repeat(depth)}${plain(block.content)}`);
    }

    block.children.forEach((child) => walk(child, depth + 1));
  };

  fragment.blocks.forEach((block) => walk(block, 0));

  return lines.join('\n');
}

function inlineToHtml(nodes: InlineNode[], inCode: boolean): string {
  return nodes
    .map((node) => {
      const { insert, attributes } = node;

      if (isFormulaNode(node)) {
        return `<span class="math inline">\\(${escapeHtml(String(attributes!.formula))}\\)</span>`.repeat(
          insert.length,
        );
      }

      let html = escapeHtml(insert).replace(/\n/g, inCode ? '\n' : '<br>');

      if (!attributes) return html;

      if (attributes.code && !inCode) html = `<code>${html}</code>`;
      if (attributes.bold) html = `<strong>${html}</strong>`;
      if (attributes.italic) html = `<em>${html}</em>`;
      if (attributes.underline) html = `<u>${html}</u>`;
      if (attributes.strike) html = `<s>${html}</s>`;

      if (typeof attributes.link === 'string' && isSafeUrl(attributes.link)) {
        html = `<a href="${escapeHtml(attributes.link)}">${html}</a>`;
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

function listHtml(items: FragmentBlock[]): string {
  let html = '';

  for (let i = 0; i < items.length;) {
    const type = items[i].props.type === 'ordered' ? 'ol' : 'ul';
    const group: FragmentBlock[] = [];

    while (i < items.length && (items[i].props.type === 'ordered' ? 'ol' : 'ul') === type)
      group.push(items[i++]);

    html += `<${type}>${group
      .map((item) => {
        const todo = item.props.type === 'todo';
        const box = todo
          ? `<input type="checkbox" disabled${item.props.checked === true ? ' checked' : ''}> `
          : '';
        const nested = item.children.length > 0 ? blocksToHtml(item.children) : '';

        return `<li>${box}${inlineToHtml(item.content, false)}${nested}</li>`;
      })
      .join('')}</${type}>`;
  }

  return html;
}

function blocksToHtml(blocks: FragmentBlock[]): string {
  let html = '';

  for (let i = 0; i < blocks.length;) {
    const block = blocks[i];

    if (block.flavour === 'block:list') {
      const run: FragmentBlock[] = [];

      while (i < blocks.length && blocks[i].flavour === 'block:list') run.push(blocks[i++]);

      html += listHtml(run);
      continue;
    }

    i++;

    const inner = inlineToHtml(block.content, block.flavour === 'block:code');
    const nested = block.children.length > 0 ? blocksToHtml(block.children) : '';

    switch (block.flavour) {
      case 'block:heading': {
        const level =
          typeof block.props.level === 'number' ? Math.min(Math.max(block.props.level, 1), 6) : 1;
        html += `<h${level}>${inner}</h${level}>${nested}`;
        break;
      }
      case 'block:quote':
        html += `<blockquote>${inner}</blockquote>${nested}`;
        break;
      case 'block:code': {
        const language =
          typeof block.props.language === 'string' && /^[\w+#-]+$/.test(block.props.language)
            ? block.props.language
            : 'plain';
        html += `<pre><code class="language-${language}">${inner}</code></pre>`;
        break;
      }
      case 'block:divider':
        html += '<hr>';
        break;
      case 'block:formula': {
        const latex = typeof block.props.latex === 'string' ? block.props.latex : '';

        if (latex !== '') html += `<div class="math display">\\[${escapeHtml(latex)}\\]</div>`;
        break;
      }
      case 'block:callout': {
        const tone =
          typeof block.props.tone === 'string' && /^\w+$/.test(block.props.tone)
            ? block.props.tone
            : 'info';
        html += `<aside data-callout="${tone}">${inner}</aside>${nested}`;
        break;
      }
      case 'block:image': {
        const src = typeof block.props.src === 'string' ? block.props.src : '';

        if (!isSafeImageUrl(src)) break;

        const alt = typeof block.props.alt === 'string' ? block.props.alt : '';
        const caption = typeof block.props.caption === 'string' ? block.props.caption : '';

        html += `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">${
          caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''
        }</figure>`;
        break;
      }
      default:
        html += `<p>${inner}</p>${nested}`;
    }
  }

  return html;
}

/**
 * Семантический HTML фрагмента для вставки в другие приложения (Word, Docs, почта).
 * Если задан `embed`, в обёртку кладётся точный фрагмент Inkbrick — он переживает приложения,
 * которые вырезают собственные форматы буфера обмена.
 */
export function fragmentToHtml(fragment: Fragment, embed?: string): string {
  const attribute = embed ? ` data-inkbrick-fragment="${escapeHtml(embed)}"` : '';

  return `<div${attribute}>${blocksToHtml(fragment.blocks)}</div>`;
}
