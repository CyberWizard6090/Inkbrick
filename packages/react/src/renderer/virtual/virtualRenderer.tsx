import type { ChildListProps, DocumentRenderer } from '../DocumentRenderer';
import { estimateBlockHeight, type BlockHeightEstimate } from './estimate';
import { VirtualChildList, type ResolvedVirtualOptions } from './VirtualChildList';

export interface VirtualRendererOptions {
  /** Контейнер с меньшим числом детей рисуется целиком. По умолчанию 100. */
  readonly threshold?: number;
  /** Запас над и под видимой областью, в котором блоки уже отрисованы, px. По умолчанию 1200. */
  readonly overscan?: number;
  /** Не больше стольких блоков подряд в окне (защита от нулевых высот). По умолчанию 400. */
  readonly maxRendered?: number;
  readonly estimateHeight?: BlockHeightEstimate;
}

/**
 * Виртуальный рендерер: в DOM только блоки около видимой области, остальные заменены распорками известной
 * (измеренной) или оценённой высоты. Подключение: `<DocumentView renderer={virtualRenderer()} />` (или
 * `renderer="virtual"` с настройками по умолчанию). Создавайте рендерер один раз, вне компонента.
 */
export function virtualRenderer(options: VirtualRendererOptions = {}): DocumentRenderer {
  const resolved: ResolvedVirtualOptions = {
    threshold: Math.max(1, options.threshold ?? 100),
    overscan: Math.max(0, options.overscan ?? 1200),
    maxRendered: Math.max(1, options.maxRendered ?? 400),
    estimateHeight: options.estimateHeight ?? estimateBlockHeight,
  };

  function VirtualChildren(props: ChildListProps) {
    return <VirtualChildList {...props} options={resolved} />;
  }

  return { ChildList: VirtualChildren };
}

export const defaultVirtualRenderer = virtualRenderer();
