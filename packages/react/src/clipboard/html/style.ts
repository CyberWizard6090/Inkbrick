import { type TextAttributes, isSafeUrl, normalizeLinkUrl } from '@inkbrick/document';
import { type Style, tagOf } from './tags';

export function weight(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();

  if (v === '') return undefined;
  if (v === 'bold' || v === 'bolder') return true;
  if (v === 'normal' || v === 'lighter') return false;

  const n = Number(v);

  return Number.isNaN(n) ? undefined : n >= 600;
}

export function styleOf(element: HTMLElement, base: Style): Style {
  const style: Style = { ...base };

  switch (tagOf(element)) {
    case 'B':
    case 'STRONG':
      style.bold = true;
      break;
    case 'I':
    case 'EM':
    case 'CITE':
    case 'DFN':
      style.italic = true;
      break;
    case 'U':
    case 'INS':
      style.underline = true;
      break;
    case 'S':
    case 'DEL':
    case 'STRIKE':
      style.strike = true;
      break;
    case 'CODE':
    case 'KBD':
    case 'SAMP':
    case 'TT':
      style.code = true;
      break;
    case 'A': {
      const href = element.getAttribute('href');
      const link = href ? normalizeLinkUrl(href) : null;

      if (link) style.link = link;
      break;
    }
  }

  // Встроенные стили (Google Docs / Word передают форматирование ими) переопределяют теги.
  const css = element.style;

  if (css) {
    const bold = weight(css.fontWeight ?? '');
    if (bold !== undefined) style.bold = bold;

    const italic = (css.fontStyle ?? '').toLowerCase();
    if (italic === 'italic' || italic === 'oblique') style.italic = true;
    else if (italic === 'normal') style.italic = false;

    const decoration = `${css.textDecorationLine ?? ''} ${css.textDecoration ?? ''}`.toLowerCase();
    if (decoration.includes('underline')) style.underline = true;
    if (decoration.includes('line-through')) style.strike = true;
  }

  return style;
}

export function attributesOf(style: Style): TextAttributes | undefined {
  const attributes: TextAttributes = {};

  if (style.bold) attributes.bold = true;
  if (style.italic) attributes.italic = true;
  if (style.underline) attributes.underline = true;
  if (style.strike) attributes.strike = true;
  if (style.code) attributes.code = true;
  if (style.link && isSafeUrl(style.link)) attributes.link = style.link;

  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

export function isHidden(element: HTMLElement): boolean {
  return (
    element.hasAttribute('hidden') ||
    element.style?.display === 'none' ||
    element.style?.visibility === 'hidden'
  );
}
