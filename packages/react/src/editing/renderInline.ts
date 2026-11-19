import {
  FORMULA_CHAR,
  isColorName,
  isSafeUrl,
  safeCssColor,
  type InlineNode,
  type TextAttributes,
} from '@inkbrick/document';

import type { FootnoteIndex } from '../footnote/FootnoteIndex';
import { ensureMathStyles, mountFormula, type FormulaRenderer } from '../math/renderer';

export interface RenderInlineOptions {
  readonly formulaRenderer?: FormulaRenderer | null;
  /** Индекс сносок редактора: ссылки на сноски показывают в нём свой номер. Нужен, только если в тексте есть сноски. */
  readonly footnotes?: FootnoteIndex;
}

/** Фрагменты, которые не проверяются на орфографию: код, ссылки, формулы. */
const NO_SPELLCHECK = new Set<keyof HTMLElementTagNameMap>(['code', 'a']);

function wrap(node: Node, tag: keyof HTMLElementTagNameMap): HTMLElement {
  const element = globalThis.document.createElement(tag);

  if (NO_SPELLCHECK.has(tag)) element.setAttribute('spellcheck', 'false');
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
  host.setAttribute('spellcheck', 'false');
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

/**
 * Ссылка на сноску — объект из одного символа. Номер рисуется в теневом корне и не входит в текст блока, поэтому смещения
 * курсора остаются равными смещениям модели; цифра обновляется индексом, когда номера меняются.
 */
function renderFootnoteAtom(id: string, options: RenderInlineOptions): HTMLElement {
  const doc = globalThis.document;
  const host = doc.createElement('span');

  host.setAttribute('data-inkbrick-footnote', id);
  host.setAttribute('data-inkbrick-part', 'footnote-ref');
  host.setAttribute('contenteditable', 'false');
  host.setAttribute('spellcheck', 'false');
  host.textContent = FORMULA_CHAR;

  const label = doc.createElement('sup');

  label.setAttribute('part', 'label');

  try {
    host.attachShadow({ mode: 'open' }).appendChild(label);
  } catch {
    // Теневой DOM недоступен: номер показывает CSS (`::after`), смещения не меняются.
    host.setAttribute('data-state', 'fallback');

    return host;
  }

  if (options.footnotes) options.footnotes.addLabel(label, id);
  else label.textContent = '?';

  return host;
}

function renderNode(
  insert: string,
  attributes: TextAttributes | undefined,
  options: RenderInlineOptions,
): Node {
  let node: Node;

  if (typeof attributes?.footnote === 'string') {
    const fragment = globalThis.document.createDocumentFragment();

    for (let i = 0; i < insert.length; i++)
      fragment.appendChild(renderFootnoteAtom(attributes.footnote, options));

    node = fragment;
  } else if (typeof attributes?.formula === 'string') {
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
    else if (safeBackground) {
      // Цвет пользователя смешивается с фоном (стили в blocks.css), как и заготовленные: чистый красный не режет глаз.
      span.setAttribute('data-inkbrick-bg', 'custom');
      span.style.setProperty('--inkbrick-custom-bg', safeBackground);
    }

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
   * <br> нужен в трёх случаях: пустой блок (иначе в нём нельзя поставить курсор),
   * завершающий перевод строки в white-space: pre-wrap (виден только с <br> после него) и
   * блок, оканчивающийся объектом (формула, ссылка на сноску): после нередактируемого элемента в конце строки
   * браузер не ставит курсор, а с <br> за ним — ставит.
   * На смещения текста <br> не влияет: Range.toString() его игнорирует.
   */
  const text = nodes.map((node) => node.insert).join('');
  const last = nodes.findLast((node) => node.insert.length > 0);
  const endsWithObject =
    typeof last?.attributes?.formula === 'string' || typeof last?.attributes?.footnote === 'string';

  if (text === '' || text.endsWith('\n') || endsWithObject) {
    fragment.appendChild(globalThis.document.createElement('br'));
  }

  root.replaceChildren(fragment);
}
