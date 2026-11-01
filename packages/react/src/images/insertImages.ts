import { flushSync } from 'react-dom';

import { createId } from '@inkbrick/document';
import type { CaretResult, Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';
import { toImageErrorInfo } from './ImageError';
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

/**
 * Вставляет картинки из файлов (вставка, перетаскивание) после блока `afterId`. Блок появляется сразу
 * (с индикатором загрузки); если загрузка не удалась, пустой блок убирается. Пустой параграф заменяется картинкой.
 * Возвращает false, если среди файлов нет подходящих изображений.
 */
export function insertImageFiles(
  editor: Editor,
  view: EditorView,
  options: ImageOptions,
  files: readonly File[],
  afterId: string,
): boolean {
  const images = files.filter((file) => isAcceptedImage(file, options));

  if (images.length === 0 || editor.readOnly) return false;

  let anchor = topLevelBlockId(editor, afterId);
  let caret: CaretResult | undefined;

  const mergeKey = `images:${createId()}`;
  const created: Array<{ id: string; file: File }> = [];

  flushSync(() => {
    editor.batch(
      () => {
        for (const file of images) {
          const target = editor.store.getBlock(anchor);
          const alt = altFromName(file);

          // Пустой параграф заменяется картинкой (и под ней появляется параграф для продолжения).
          const emptyParagraph =
            target?.flavour === 'block:paragraph' &&
            target.content.length === 0 &&
            target.children.length === 0;

          if (emptyParagraph) {
            caret = editor.dispatch({
              type: 'convertBlock',
              payload: { blockId: anchor, flavour: 'block:image', props: { alt } },
            }) as CaretResult | undefined;
            created.push({ id: anchor, file });
          } else {
            const inserted = editor.dispatch({
              type: 'insertBlock',
              payload: { flavour: 'block:image', afterId: anchor, props: { alt } },
            }) as CaretResult | undefined;

            if (!inserted) continue;

            created.push({ id: inserted.blockId, file });
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
