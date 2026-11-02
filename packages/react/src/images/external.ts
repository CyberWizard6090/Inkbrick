import { isSafeImageUrl } from '@inkbrick/document';
import type { Fragment, FragmentBlock } from '@inkbrick/engine';

import type { ImageOptions } from './types';

/** Картинка на чужом сервере: http(s)-адрес не с адреса страницы. Браузер пошёл бы за ней сам (IP, referrer). */
export function isExternalImageUrl(src: unknown): src is string {
  if (typeof src !== 'string' || !/^https?:\/\//i.test(src)) return false;

  try {
    return new URL(src).origin !== window.location.origin;
  } catch {
    return false;
  }
}

function hasExternalImage(blocks: readonly FragmentBlock[]): boolean {
  return blocks.some(
    (block) =>
      (block.flavour === 'block:image' && isExternalImageUrl(block.props.src)) ||
      hasExternalImage(block.children),
  );
}

export const hasExternalImages = (fragment: Fragment): boolean => hasExternalImage(fragment.blocks);

/**
 * Пропускает адреса чужих картинок через `images.rehost` ДО вставки: пока хук не ответил, блока с такой картинкой
 * нет, и браузер не обращается к чужому серверу. Картинка, для которой хук вернул `null`, небезопасный адрес
 * или ошибку, из фрагмента убирается. Одинаковые адреса обрабатываются один раз.
 */
export async function rehostExternalImages(
  fragment: Fragment,
  rehost: NonNullable<ImageOptions['rehost']>,
): Promise<Fragment> {
  const cache = new Map<string, Promise<string | null>>();

  const resolve = (src: string): Promise<string | null> => {
    let result = cache.get(src);

    if (!result) {
      result = Promise.resolve()
        .then(() => rehost(src))
        .then((next) => (typeof next === 'string' && isSafeImageUrl(next) ? next : null))
        .catch((error: unknown) => {
          console.warn('[@inkbrick/react] images.rehost failed, the image is skipped:', error);

          return null;
        });
      cache.set(src, result);
    }

    return result;
  };

  const walk = async (blocks: readonly FragmentBlock[]): Promise<FragmentBlock[]> => {
    const out: FragmentBlock[] = [];

    for (const block of blocks) {
      let next = block;

      if (block.flavour === 'block:image' && isExternalImageUrl(block.props.src)) {
        const src = await resolve(block.props.src);

        if (src === null) continue;

        next = { ...block, props: { ...block.props, src } };
      }

      out.push({ ...next, children: await walk(next.children) });
    }

    return out;
  };

  return { blocks: await walk(fragment.blocks) };
}
