import { lazyModule, useLazy } from '../ui/lazy';
import type { BlockViewProps } from '../ui/types';

const imageBlock = lazyModule(() => import('./ImageBlock').then((module) => module.ImageBlock));

/**
 * Блок картинки из отдельного чанка: пока он грузится (это мгновение при первой картинке), на месте блока пустое место
 * той же разметки. `ImageBlock` по-прежнему экспортируется для своих реестров компонентов.
 */
export function LazyImageBlock(props: BlockViewProps) {
  const ImageBlock = useLazy(imageBlock);

  if (ImageBlock) return <ImageBlock {...props} />;

  return (
    <div
      className="block block-image"
      data-inkbrick-block="image"
      data-block-id={props.block.id}
      data-loading=""
      contentEditable={false}
    />
  );
}
