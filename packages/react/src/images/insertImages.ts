import { flushSync } from 'react-dom';

import { createId } from '@inkbrick/document';
import type { CaretResult, Editor } from '@inkbrick/engine';

import { toImageErrorInfo } from '@inkbrick/view';
import type { EditorView } from '@inkbrick/view';
import type { ImageOptions } from './types';
import { isAcceptedImage, uploadImage } from './upload';

export function topLevelBlockId(editor: Editor, blockId: string): string {
  let current = editor.store.getBlock(blockId);

  while (current?.parentId) {
    const parent = editor.store.getBlock(current.parentId);

    if (!parent || parent.flavour === 'block:note' || !parent.parentId) break;

    current = parent;
  }

  return current?.id ?? blockId;
}

const altFromName = (file: File) => file.name.replace(/\.[^.]+$/, '').slice(0, 200);

function report(options: ImageOptions, error: unknown, file: File): void {
  if (options.onError) options.onError(error, file);
  else console.error('[@inkbrick/react] Could not add the image:', error);
}

export async function fillImageBlock(
  editor: Editor,
  view: EditorView,
  options: ImageOptions,
  blockId: string,
  file: File,
  mergeKey?: string,
): Promise<boolean> {
  view.uploads.start(blockId);

  try {
    const src = await uploadImage(file, options);

    flushSync(() => {
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId, props: { src, alt: altFromName(file) }, mergeKey },
      });
    });

    view.uploads.finish(blockId);

    return true;
  } catch (error) {
    view.uploads.finish(blockId, toImageErrorInfo(error));
    report(options, error, file);
    return false;
  }
}

/** Что вставлять: файл (загружается) или готовый адрес картинки (например, перетащенной с сайта). */
export type ImageSource = File | { readonly src: string; readonly alt?: string };

/**
 * Вставляет картинки из файлов (вставка, перетаскивание) после блока `afterId` — или перед ним (`position: 'before'`).
 * Блок с файлом появляется сразу (с индикатором загрузки); если загрузка не удалась, пустой блок убирается. Пустой
 * параграф заменяется картинкой. Возвращает false, если среди файлов нет подходящих изображений.
 */
export function insertImageFiles(
  editor: Editor,
  view: EditorView,
  options: ImageOptions,
  files: readonly ImageSource[],
  afterId: string,
  position: 'before' | 'after' = 'after',
): boolean {
  const images = files.filter((file) => !(file instanceof File) || isAcceptedImage(file, options));

  if (images.length === 0 || editor.readOnly) return false;

  let anchor = topLevelBlockId(editor, afterId);
  let caret: CaretResult | undefined;
  // «Перед блоком»: после предыдущего соседа, а у первого блока — первым потомком его родителя.
  let firstIn: string | null = null;

  if (position === 'before') {
    const previous = editor.document.getPreviousSibling(anchor);

    if (previous) anchor = previous.id;
    else firstIn = editor.store.getBlock(anchor)?.parentId ?? null;
  }

  const mergeKey = `images:${createId()}`;
  const created: Array<{ id: string; file: File }> = [];

  flushSync(() => {
    editor.batch(
      () => {
        for (const file of images) {
          const props =
            file instanceof File
              ? { alt: altFromName(file) }
              : { src: file.src, alt: file.alt ?? '' };
          const target = editor.store.getBlock(anchor);

          // Пустой параграф заменяется картинкой (и под ней появляется параграф для продолжения).
          const emptyParagraph =
            firstIn === null &&
            target?.flavour === 'block:paragraph' &&
            target.content.length === 0 &&
            target.children.length === 0;

          if (emptyParagraph) {
            caret = editor.dispatch({
              type: 'convertBlock',
              payload: { blockId: anchor, flavour: 'block:image', props },
            }) as CaretResult | undefined;
            if (file instanceof File) created.push({ id: anchor, file });
          } else {
            const inserted = editor.dispatch({
              type: 'insertBlock',
              payload:
                firstIn !== null
                  ? { flavour: 'block:image', parentId: firstIn, props }
                  : { flavour: 'block:image', afterId: anchor, props },
            }) as CaretResult | undefined;

            firstIn = null;

            if (!inserted) continue;

            if (file instanceof File) created.push({ id: inserted.blockId, file });
            anchor = inserted.blockId;

            if (!editor.document.getNextSibling(anchor)) {
              caret = editor.dispatch({
                type: 'insertBlock',
                payload: { flavour: 'block:paragraph', afterId: anchor },
              }) as CaretResult | undefined;
            } else {
              caret = { blockId: editor.document.getNextSibling(anchor)!.id, offset: 0 };
            }
          }
        }
      },
      { mergeKey },
    );
  });

  if (caret) view.placeCaret(caret.blockId, caret.offset);

  for (const { id, file } of created) {
    void fillImageBlock(editor, view, options, id, file, mergeKey).then((ok) => {
      if (!ok && (editor.store.getBlock(id)?.props.src ?? '') === '') {
        flushSync(() => {
          editor.execute('delete-block', { id });
        });
      }
    });
  }

  return true;
}
