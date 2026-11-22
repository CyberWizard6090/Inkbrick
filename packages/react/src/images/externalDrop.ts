/**
 * Перетаскивание картинок снаружи (файлы из файлового менеджера, картинки с сайтов): линия вставки, пока картинку
 * несут над документом, и вставка туда, где её отпустили. Модуль грузится отдельным чанком при первом таком переносе
 * и берёт всё нужное из контекста (`DropContext`), а не импортом: иначе сборщик вынес бы общий код ядра в ещё один
 * чанк, который грузится сразу.
 */
import type { Editor } from '@inkbrick/engine';

import type { DropPosition } from '../block-handle/BlockHandleController';
import type { EditorView } from '../editing/EditorView';
import type { ImageOptions } from './types';

/** Что редактор передаёт модулю. */
export interface DropContext {
  readonly editor: Editor;
  readonly view: EditorView;
  readonly root: HTMLElement;
  readonly images: ImageOptions;
  readonly readOnly: boolean;
  readonly geometry: {
    probePoint(view: EditorView, x: number, y: number): { x: number; y: number } | null;
    blockAtPoint(editor: Editor, view: EditorView, x: number, y: number): string | null;
    rowRect(view: EditorView, blockId: string): DOMRect | null;
    blockElement(view: EditorView, blockId: string): HTMLElement | null;
    topLevelBlockId(editor: Editor, blockId: string): string;
  };
  insert(
    editor: Editor,
    view: EditorView,
    options: ImageOptions,
    sources: ReadonlyArray<File | { src: string }>,
    afterId: string,
    position: DropPosition,
  ): boolean;
  isAccepted(file: File, options: ImageOptions): boolean;
  isSafe(url: string): boolean;
  isExternal(url: string): boolean;
  caretBlock(): string | undefined;
}

/** Что принесли: файлы, HTML и список ссылок (читаются сразу в `drop`), и точка, где отпустили. */
export interface Dropped {
  readonly files: readonly File[];
  readonly html: string;
  readonly uriList: string;
  readonly x: number;
  readonly y: number;
}

export interface ExternalDropTarget {
  /** Блок верхнего уровня, рядом с которым встанет картинка. */
  readonly targetId: string;
  readonly position: DropPosition;
  readonly indicator: { readonly left: number; readonly top: number; readonly width: number };
}

/**
 * Перенос не блока, а чего-то снаружи: так он отмечен в состоянии переноса, чтобы линию вставки рисовал тот же
 * `DropIndicatorHost`, что и у блоков.
 */
export const EXTERNAL_DRAG = 'inkbrick:external';

/** Куда встанет картинка, отпущенная в точке окна: до или после блока верхнего уровня под ней (по половине строки). */
export function externalDropTarget(
  context: DropContext,
  x: number,
  y: number,
): ExternalDropTarget | null {
  const { editor, view, geometry } = context;
  const probe = geometry.probePoint(view, x, y);
  const under = probe ? geometry.blockAtPoint(editor, view, probe.x, probe.y) : null;

  if (!under) return null;

  const targetId = geometry.topLevelBlockId(editor, under);
  const row = geometry.rowRect(view, targetId);
  const box = geometry.blockElement(view, targetId)?.getBoundingClientRect();

  if (!row || !box) return null;

  const position: DropPosition = y < row.top + row.height / 2 ? 'before' : 'after';

  return {
    targetId,
    position,
    // «После» — после всего блока вместе с вложенными.
    indicator: {
      left: box.left,
      width: box.width,
      top: position === 'before' ? row.top - 1 : box.bottom + 1,
    },
  };
}

/** Картинку несут над документом: линия вставки следует за ней. Перенос блока не трогаем. */
export function over(context: DropContext, x: number, y: number): void {
  const { view } = context;
  const state = view.blocks.getState().drag;

  if (context.readOnly || (state && state.blockId !== EXTERNAL_DRAG)) return;

  const target = externalDropTarget(context, x, y);

  if (!state) view.blocks.startDrag(EXTERNAL_DRAG);

  view.blocks.updateDrag(
    target
      ? { ...target, side: null }
      : { targetId: null, position: null, side: null, indicator: null },
  );
}

/** Картинку унесли с документа (или перенос кончился): линию убираем и возвращаем, куда она указывала. */
export function leave(context: DropContext): { targetId: string; position: DropPosition } | null {
  const state = context.view.blocks.getState().drag;

  if (state?.blockId !== EXTERNAL_DRAG) return null;

  context.view.blocks.endDrag();

  return state.targetId && state.position
    ? { targetId: state.targetId, position: state.position }
    : null;
}

const IMAGE_PATH = /\.(png|jpe?g|gif|webp|avif)$/i;

/**
 * Адреса картинок, перетащенных с сайта: `<img src>` из HTML, иначе ссылки из `text/uri-list`, похожие на картинку.
 * Небезопасные адреса (и SVG) отбрасываются.
 */
export function droppedImageUrls(
  { html, uriList }: Pick<Dropped, 'html' | 'uriList'>,
  isSafe: (url: string) => boolean,
): string[] {
  const urls: string[] = [];

  if (html) {
    // Разбираем только начало: картинка с сайта — это пара тегов, а не мегабайты разметки.
    const parsed = new DOMParser().parseFromString(html.slice(0, 200_000), 'text/html');

    for (const image of parsed.querySelectorAll('img[src]')) urls.push(image.getAttribute('src')!);
  }

  if (urls.length === 0) {
    for (const line of uriList.split(/\r?\n/)) {
      const url = line.trim();

      if (
        url &&
        !url.startsWith('#') &&
        (/^data:image\//i.test(url) || IMAGE_PATH.test(url.split(/[?#]/)[0]))
      ) {
        urls.push(url);
      }
    }
  }

  return [...new Set(urls.map((url) => url.trim()))].filter(isSafe);
}

/**
 * Картинку отпустили: файлы загружаются как обычно, картинки с сайта вставляются по адресу (адреса чужих серверов
 * сначала идут через `images.rehost`, если он задан). Место — там, где была линия вставки, иначе у каретки.
 * Возвращает, вставлено ли что-нибудь.
 */
export async function drop(context: DropContext, dropped: Dropped): Promise<boolean> {
  const { editor, view, images } = context;
  const shown = leave(context);

  if (context.readOnly) return false;

  const point = shown ?? externalDropTarget(context, dropped.x, dropped.y);
  const target = point?.targetId ?? context.caretBlock();
  const position = point?.position ?? 'after';

  if (!target) return false;

  const files = dropped.files.filter((file) => context.isAccepted(file, images));

  if (files.length > 0) return context.insert(editor, view, images, files, target, position);

  const resolved = await Promise.all(
    droppedImageUrls(dropped, context.isSafe).map(async (src) => {
      if (!images.rehost || !context.isExternal(src)) return src;

      try {
        const next = await images.rehost(src);

        return typeof next === 'string' && context.isSafe(next) ? next : null;
      } catch (error) {
        console.warn('[@inkbrick/react] images.rehost failed, the image is skipped:', error);

        return null;
      }
    }),
  );
  const sources = resolved.filter((src): src is string => src !== null).map((src) => ({ src }));

  return (
    sources.length > 0 &&
    !!editor.store.getBlock(target) &&
    context.insert(editor, view, images, sources, target, position)
  );
}
