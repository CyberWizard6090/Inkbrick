import { useSyncExternalStore } from 'react';

import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { lazyModule, useLazy } from '../ui/lazy';

const formulaPopover = lazyModule(() =>
  import('./FormulaPopover').then((module) => module.FormulaPopover),
);

/** Попап редактирования формулы — отдельный чанк: грузится заранее, но не входит в основной бандл. */
export function FormulaPopoverHost() {
  const view = useEditorView();
  const readOnly = useReadOnly();
  const Popover = useLazy(formulaPopover, !readOnly);
  const open = useSyncExternalStore(
    view.formula.subscribe,
    () => view.formula.getState().open,
    () => false,
  );

  return open && Popover ? <Popover /> : null;
}
