import { useEffect, useRef } from 'react';

import type { ImageAspect } from '@inkbrick/document';
import { isSafeImageUrl } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';
import type { CropperHandle } from '@inkbrick/dom/image-tools';

import { useT } from '../hooks/useT';
import type { BlockCrop, Rect } from '../images/crop';
import { imageTools } from '../images/saveCrop';
import { useLazy } from '../ui/lazy';

/** Тема окна: ближайший `data-inkbrick-theme` над блоком (окно вставляется в `body`, тема должна совпасть). */
export function themeOf(element: Element | null): 'light' | 'dark' | undefined {
  const theme = element?.closest('[data-inkbrick-theme]')?.getAttribute('data-inkbrick-theme');

  return theme === 'light' || theme === 'dark' ? theme : undefined;
}

interface CropDialogProps {
  readonly src: string;
  readonly alt: string;
  readonly crop: BlockCrop;
  readonly busy: boolean;
  readonly theme?: 'light' | 'dark';
  onSave(rect: Rect, aspect: ImageAspect): void;
  onCancel(): void;
}

/**
 * Окно обрезки из `@inkbrick/dom/image-tools` (чанк грузится при первом открытии) с надписями на языке редактора. Окно — не
 * React-компонент: оно открывается при монтировании и закрывается при размонтировании, а обработчики берутся свежими.
 */
export function CropDialog({ src, alt, crop, busy, theme, onSave, onCancel }: CropDialogProps) {
  const tools = useLazy(imageTools);
  const t = useT();
  const handle = useRef<CropperHandle | null>(null);
  const handlers = useRef({ onSave, onCancel });

  handlers.current = { onSave, onCancel };

  useEffect(() => {
    if (!tools) return;

    handle.current = tools.openCropper({
      src,
      alt,
      initialRect: crop.rect,
      initialAspect: crop.aspect,
      theme,
      labels: {
        title: t('image.crop'),
        cancel: t('image.crop.cancel'),
        save: t('image.crop.save'),
        shape: t('image.crop.shape'),
        free: t('image.crop.free'),
        circle: t('image.crop.circle'),
        square: t('image.crop.square'),
        portrait: t('image.crop.portrait'),
        landscape: t('image.crop.landscape'),
        frame: t('image.crop.frame'),
      },
      onSave: (result) => handlers.current.onSave(result.rect, result.aspect),
      onCancel: () => handlers.current.onCancel(),
    });

    return () => {
      handle.current?.close();
      handle.current = null;
    };
    // Окно открывается один раз на картинку; надписи и рамка берутся на момент открытия.
  }, [tools, src]);

  useEffect(() => handle.current?.setBusy(busy), [busy, tools]);

  return null;
}

/** Картинка документа для просмотра: блок и что показать. */
export interface DocumentImage {
  readonly blockId: string;
  readonly src: string;
  readonly alt: string;
}

/** Все картинки документа по порядку (для «назад» и «вперёд» в просмотре). */
export function documentImages(editor: Editor): DocumentImage[] {
  const images: DocumentImage[] = [];
  const visit = (id: string) => {
    const block = editor.store.getBlock(id);

    if (!block) return;

    if (block.flavour === 'block:image') {
      const src = typeof block.props.src === 'string' ? block.props.src : '';

      if (src !== '' && isSafeImageUrl(src)) {
        images.push({
          blockId: block.id,
          src,
          alt: typeof block.props.alt === 'string' ? block.props.alt : '',
        });
      }
    }

    for (const child of block.children) visit(child);
  };

  visit(editor.document.rootId);

  return images;
}

interface ViewDialogProps {
  readonly images: readonly DocumentImage[];
  readonly index: number;
  readonly theme?: 'light' | 'dark';
  onIndexChange(index: number): void;
  onClose(): void;
}

/** Просмотр во весь экран из `@inkbrick/dom/image-tools` с надписями на языке редактора (открыт, пока смонтирован). */
export function ViewDialog({ images, index, theme, onIndexChange, onClose }: ViewDialogProps) {
  const tools = useLazy(imageTools);
  const t = useT();
  const handlers = useRef({ onIndexChange, onClose });

  handlers.current = { onIndexChange, onClose };

  useEffect(() => {
    if (!tools) return;

    const handle = tools.openViewer({
      images,
      index,
      theme,
      labels: {
        dialog: t('image.viewer'),
        previous: t('image.viewer.previous'),
        next: t('image.viewer.next'),
        zoomIn: t('image.viewer.zoomIn'),
        zoomOut: t('image.viewer.zoomOut'),
        zoomReset: t('image.viewer.zoomReset'),
        download: t('image.download'),
        close: t('image.viewer.close'),
      },
      onIndexChange: (next) => handlers.current.onIndexChange(next),
      onClose: () => handlers.current.onClose(),
    });

    return () => handle.close();
    // Список картинок собирается при открытии; номер дальше ведёт само окно.
  }, [tools, images]);

  return null;
}
