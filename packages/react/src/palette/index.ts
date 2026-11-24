import { useSyncExternalStore } from 'react';
import { getPaletteController, type PaletteController, type PaletteState } from '@inkbrick/view';

import { useEditorView } from '../hooks/useEditorView';
import type { KeyBinding } from '../keymap/types';

export { CommandPalette } from './CommandPalette';
export type { CommandPaletteProps } from './CommandPalette';
export { PaletteController } from '@inkbrick/view';
export type { PaletteState } from '@inkbrick/view';
export type { PaletteCommand, PaletteContext, PaletteText } from './types';

/**
 * Палитра команд: Ctrl/Cmd+Shift+P открывает окно поиска по действиям. Клавиши подключаются в провайдере, окно кладётся
 * рядом с документом —
 *
 * ```tsx
 * import { commandPalette, CommandPalette } from '@inkbrick/react';
 *
 * <EditorProvider editor={editor} keymap={commandPalette.keymap}>
 *   <CommandPalette commands={[{ id: 'app.save', title: 'Save', run: save }]} />
 *   <DocumentView />
 * </EditorProvider>
 * ```
 *
 * Ctrl+P браузер отдаёт печати, поэтому палитра на Ctrl+Shift+P; другую комбинацию задаёт своя привязка с `id: 'palette.open'`.
 * Если у провайдера уже есть свои клавиши: `keymap={[...commandPalette.keymap, ...mine]}`.
 */
export const commandPalette: { readonly keymap: readonly KeyBinding[] } = {
  keymap: [
    {
      id: 'palette.open',
      keys: 'Mod-Shift-p',
      run: ({ view }) => {
        getPaletteController(view).toggle();
      },
    },
  ],
};

/** Управление палитрой из кода: `open`, `close`, `toggle`; состояние — `state`. */
export function useCommandPalette(): {
  readonly controller: PaletteController;
  readonly state: PaletteState;
} {
  const view = useEditorView();
  const controller = getPaletteController(view);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  return { controller, state };
}
