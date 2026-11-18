import { lazyModule, useLazy } from '../ui/lazy';
import type { BlockViewProps } from '../ui/types';
import { CodeShell } from './CodeShell';

const codeParts = lazyModule(
  () =>
    import('./CodeBlock').then(({ CodeToolbar, CodeCaption }) => ({ CodeToolbar, CodeCaption })),
  { soon: true },
);

/**
 * Блок кода: каркас и текст в основном бандле, панель (язык, свёртка, копирование) и подпись из отдельного чанка. Чанк
 * подгружается сразу после монтирования редактора, но даже если блок появился раньше, он принимает ввод сразу: поле
 * ввода то же самое до и после прихода панели, а панель просто появляется над ним. `CodeBlock` по-прежнему
 * экспортируется для своих реестров компонентов.
 */
export function LazyCodeBlock(props: BlockViewProps) {
  const parts = useLazy(codeParts);

  return (
    <CodeShell
      {...props}
      Toolbar={parts?.CodeToolbar ?? null}
      Caption={parts?.CodeCaption ?? null}
    />
  );
}
