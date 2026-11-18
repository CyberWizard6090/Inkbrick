import { useReadOnly } from '../hooks/useReadOnly';
import { lazyModule, useLazy } from '../ui/lazy';

const formulaPopover = lazyModule(() =>
  import('./FormulaPopover').then((module) => module.FormulaPopover),
);

/** Попап редактирования формулы — отдельный чанк: грузится заранее, но не входит в основной бандл. */
export function FormulaPopoverHost() {
  const readOnly = useReadOnly();
  const Popover = useLazy(formulaPopover, !readOnly);

  // Попап остаётся смонтированным и сам плавно убирается, когда формулу закрыли.
  return Popover ? <Popover /> : null;
}
