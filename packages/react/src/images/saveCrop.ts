import type { ImageAspect } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import { lazyModule } from '../ui/lazy';
import { cropOf, cropProps, isCropped, isFullRect, originalOf, type Rect } from './crop';
import type { ImageOptions } from './types';
import { uploadImage } from './upload';

/** Окно обрезки, просмотр и холст — отдельный чанк: он нужен, только когда картинку обрезают, смотрят или скачивают. */
export const imageTools = lazyModule(() => import('@inkbrick/image-tools'));

/** Как сохранилась обрезка: файлом, стилем (файл сделать не вышло), сброшена или блока уже нет. */
export type SavedCrop = 'file' | 'style' | 'reset' | 'gone';

const setProps = (editor: Editor, blockId: string, props: Record<string, unknown>) =>
  editor.dispatch({ type: 'setBlockProps', payload: { blockId, props: props as never } });

/**
 * Сохраняет обрезку картинки: делает файл обрезки (холст), загружает его как обычную картинку (`images.upload` или
 * data:-адрес) и записывает в блок вместе с оригиналом — одним шагом истории. Если файл сделать нельзя (картинка с
 * чужого сервера без CORS, слишком большой файл без `upload`, ошибка загрузки), блок обрезает оригинал стилем.
 */
export async function saveCrop(
  editor: Editor,
  options: ImageOptions,
  blockId: string,
  rect: Rect,
  aspect: ImageAspect,
): Promise<SavedCrop> {
  const block = editor.store.getBlock(blockId);

  if (!block) return 'gone';

  const original = originalOf(block.props);
  const props = cropProps(rect, aspect);

  if (aspect !== 'circle' && isFullRect(rect)) {
    setProps(editor, blockId, { ...props, src: original, originalSrc: '' });

    return 'reset';
  }

  let src: string | null = null;

  try {
    const tools = await imageTools.preload();
    const blob = await tools.cropImage(original, rect, {
      shape: aspect === 'circle' ? 'circle' : 'rect',
    });
    const file = new File([blob], tools.fileNameFor(original, 'image', blob.type), {
      type: blob.type,
    });

    src = await uploadImage(file, { ...options, acceptedTypes: [blob.type] });
  } catch (error) {
    console.warn('[@inkbrick/react] The crop is kept as a style: could not make a file.', error);
  }

  // Пока файл делался, картинку могли заменить или удалить: тогда обрезку не записываем.
  const now = editor.store.getBlock(blockId);

  if (!now || originalOf(now.props) !== original) return 'gone';

  setProps(
    editor,
    blockId,
    src ? { ...props, src, originalSrc: original } : { ...props, src: original, originalSrc: '' },
  );

  return src ? 'file' : 'style';
}

/** Сохраняет показанную картинку: файл обрезки, обрезку стилем (через холст, если можно) или оригинал. */
export async function downloadShown(props: Readonly<Record<string, unknown>>): Promise<void> {
  const tools = await imageTools.preload();
  const src = typeof props.src === 'string' ? props.src : '';
  const originalSrc = typeof props.originalSrc === 'string' ? props.originalSrc : '';
  const crop = cropOf(props);

  if (originalSrc === '' && isCropped(crop)) {
    try {
      const blob = await tools.cropImage(src, crop.rect, {
        shape: crop.aspect === 'circle' ? 'circle' : 'rect',
      });

      tools.downloadBlob(blob, tools.fileNameFor(src, 'image', blob.type));

      return;
    } catch {
      // Холст недоступен (нет CORS): сохраняем оригинал.
    }
  }

  await tools.downloadImage(src);
}

/** Сохраняет оригинал картинки. */
export async function downloadOriginal(props: Readonly<Record<string, unknown>>): Promise<void> {
  const tools = await imageTools.preload();

  await tools.downloadImage(originalOf(props));
}
