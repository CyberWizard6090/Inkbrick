import type { BlockViewProps } from '../ui/types';

/** Props встроенных компонентов; пользовательским компонентам доступны также `editor`, `selected` и `readOnly`. */
export type BlockProps = Pick<BlockViewProps, 'block'> &
  Partial<Pick<BlockViewProps, 'selected' | 'readOnly'>>;
