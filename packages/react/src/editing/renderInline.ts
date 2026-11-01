import {
  FORMULA_CHAR,
  isColorName,
  isSafeUrl,
  safeCssColor,
  type InlineNode,
  type TextAttributes,
} from '@inkbrick/document';

import { ensureMathStyles, mountFormula, type FormulaRenderer } from '../math/renderer';

export interface RenderInlineOptions {
  readonly formulaRenderer?: FormulaRenderer | null;
}

function wrap(node: Node, tag: keyof HTMLElementTagNameMap): HTMLElement {
  const element = globalThis.document.createElement(tag);
  element.appendChild(node);
  return element;
}

/**
 * Встроенная формула — нередактируемый «объект» из одного символа. Сама формула рисуется в теневом корне: так её
 * внутренний текст (MathML) не попадает в `Range.toString()` и `textContent`, и смещения курсора остаются равными
 * смещениям модели (объект занимает ровно один символ — `FORMULA_CHAR` в обычном DOM).
 */
function renderFormulaAtom(latex: string, options: RenderInlineOptions): HTMLElement {
  const doc = globalThis.document;
  const host = doc.createElement('span');

  host.setAttribute('data-inkbrick-formula', '');
  host.setAttribute('data-inkbrick-part', 'formula-inline');
  host.setAttribute('data-latex', latex);
  host.setAttribute('contenteditable', 'false');
  host.textContent = FORMULA_CHAR;

  const view = doc.createElement('span');

  view.setAttribute('part', 'math');

  try {
    const shadow = host.attachShadow({ mode: 'open' });

    ensureMathStyles(shadow);
    shadow.appendChild(view);
  } catch {
    // Теневой DOM недоступен: исходный код показывает CSS (`[data-state='fallback']::after`), смещения не меняются.
    host.setAttribute('data-state', 'fallback');

    return host;
  }

  mountFormula(view, latex, {
    display: false,
    renderer: options.formulaRenderer ?? null,
    onSettled: (state) => host.setAttribute('data-state', state),
  });
  host.setAttribute('data-state', view.getAttribute('data-state') ?? 'loading');

  return host;
}

function renderNode(
  insert: string,
  attributes: TextAttributes | undefined,
  options: RenderInlineOptions,
): Node {
  let node: Node;

  if (typeof attributes?.formula === 'string') {
    const fragment = globalThis.document.createDocumentFragment();

    for (let i = 0; i < insert.length; i++)
      fragment.appendChild(renderFormulaAtom(attributes.formula, options));

    node = fragment;
  } else {
    node = globalThis.document.createTextNode(insert);
  }

  if (!attributes) return node;

  if (attributes.code) node = wrap(node, 'code');
  if (attributes.bold) node = wrap(node, 'strong');
  if (attributes.italic) node = wrap(node, 'em');
  if (attributes.underline) node = wrap(node, 'u');
  if (attributes.strike) node = wrap(node, 's');

  if (typeof attributes.link === 'string' && isSafeUrl(attributes.link)) {
    const anchor = wrap(node, 'a') as HTMLAnchorElement;
    anchor.href = attributes.link.trim();
    anchor.rel = 'noopener noreferrer';
    anchor.target = '_blank';
    node = anchor;
  }

  const color = attributes.color;
  const background = attributes.backgroundColor;
  const safeColor = isColorName(color) ? null : safeCssColor(color);
  const safeBackground = isColorName(background) ? null : safeCssColor(background);

  if (isColorName(color) || isColorName(background) || safeColor || safeBackground) {
    const span = wrap(node, 'span');

    if (isColorName(color)) span.setAttribute('data-inkbrick-color', color);
    else if (safeColor) span.style.color = safeColor;

    if (isColorName(background)) span.setAttribute('data-inkbrick-bg', background);
    else if (safeBackground) span.style.backgroundColor = safeBackground;

    node = span;
  }

  return node;
}

/**
 * Перерисовывает содержимое блока из модели. Содержимое contenteditable
 * намеренно рисуется императивно, а не через React: браузер может менять DOM
 * (например, при IME-вводе), и React не должен с этим конфликтовать.
 */
export function renderInline(
  root: HTMLElement,
  nodes: readonly InlineNode[],
  options: RenderInlineOptions = {},
): void {
  const fragment = globalThis.document.createDocumentFragment();

  for (const { insert, attributes } of nodes) {
    if (insert.length > 0) fragment.appendChild(renderNode(insert, attributes, options));
  }

  /*
   * <br> нужен в двух случаях: пустой блок (иначе в нём нельзя поставить курсор)
   * и завершающий перевод строки в white-space: pre-wrap (виден только с <br> после него).
   * На смещения текста <br> не влияет: Range.toString() его игнорирует.
   */
  const text = nodes.map((node) => node.insert).join('');
  if (text === '' || text.endsWith('\n')) {
    fragment.appendChild(globalThis.document.createElement('br'));
  }

  root.replaceChildren(fragment);
}
