import { type Fragment, type FragmentBlock, sanitizeFragment } from '@inkbrick/engine';
import { collect } from './html/blocks';

/**
 * HTML из буфера обмена → фрагмент Inkbrick.
 *
 * Разметка НИКОГДА не вставляется в DOM: HTML разбирается в изолированном документе (DOMParser: скрипты не
 * выполняются, картинки не загружаются), из него читается только структура и текст. Неизвестные теги
 * сводятся к тексту, ссылки проходят проверку, стили учитываются только для жирного/курсива/подчёркивания.
 * Понимает разметку Google Docs и Word (списки `mso-list`, обёртки `<b style="font-weight:normal">`).
 */

// Картинка у предела встраивания (`MAX_INLINE_BYTES_LIMIT`) занимает в HTML буфера ~5 МБ: `<img src>` плюс точная копия
// фрагмента в атрибуте. Остальное — запас на текст; больше разбирать нет смысла (защита от тяжёлой разметки).
const MAX_HTML = 6_000_000;

export function embeddedFragment(html: string): Fragment | null {
  if (!html.includes('data-inkbrick-fragment')) return null;

  const doc = new DOMParser().parseFromString(html.slice(0, MAX_HTML), 'text/html');
  const raw = doc.querySelector('[data-inkbrick-fragment]')?.getAttribute('data-inkbrick-fragment');

  if (!raw) return null;

  try {
    return sanitizeFragment(JSON.parse(decodeURIComponent(raw)));
  } catch {
    return null;
  }
}

export function htmlToFragment(html: string): Fragment | null {
  if (!html || html.length > MAX_HTML) return null;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: FragmentBlock[] = [];

  collect(doc.body, {}, blocks, 0);

  const sanitized = sanitizeFragment({ blocks: blocks.map((b) => ({ ...b, complete: true })) });

  return sanitized;
}
