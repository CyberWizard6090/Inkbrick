import { lazyModule, useLazy } from '../ui/lazy';
import type { BlockViewProps } from '../ui/types';

const formulaBlock = lazyModule(
  () => import('./FormulaBlock').then((module) => module.FormulaBlock),
  { soon: true },
);

/**
 * Блок формулы из отдельного чанка. Пока он грузится, на месте блока пустое место той же разметки; `FormulaBlock`
 * по-прежнему экспортируется для своих реестров компонентов.
 */
export function LazyFormulaBlock(props: BlockViewProps) {
  const FormulaBlock = useLazy(formulaBlock);

  return FormulaBlock ? <FormulaBlock {...props} /> : <FormulaBlockPlaceholder {...props} />;
}

/** Место блока формулы, пока грузится чанк. */
export function FormulaBlockPlaceholder({ block }: BlockViewProps) {
  return (
    <div
      className="block block-formula"
      data-inkbrick-block="formula"
      data-block-id={block.id}
      data-loading=""
      contentEditable={false}
    />
  );
}
