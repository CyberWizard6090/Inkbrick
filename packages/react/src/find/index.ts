import { useSyncExternalStore } from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import type { KeyBinding } from '../keymap/types';
import { getFindController, type FindController, type FindState } from './FindController';

export { FindReplacePanel } from './FindReplacePanel';
export { FindController } from './FindController';
export type { FindState } from './FindController';
export { findMatches, replaceMatches, searchPattern } from './search';
export type { FindMatch, FindOptions } from './search';

/** Выделенный в одном блоке текст: им заполняется строка запроса при открытии поиска. */
const selectedText = ({
  selection,
  editor,
}: Parameters<NonNullable<KeyBinding['when']>>[0]): string | undefined => {
  const current = selection();

  if (!current || current.collapsed || current.from.blockId !== current.to.blockId)
    return undefined;

  const text = (editor.store.getBlock(current.from.blockId)?.content ?? [])
    .map((node) => node.insert)
    .join('')
    .slice(current.from.offset, current.to.offset);

  return text !== '' && !text.includes('\n') ? text : undefined;
};

const open =
  (replace: boolean): KeyBinding['run'] =>
  (context) => {
    getFindController(context.editor, context.view).open(replace, selectedText(context));
  };

/**
 * Поиск и замена по документу: Ctrl/Cmd+F открывает поиск, Ctrl/Cmd+H — поиск с заменой. Клавиши подключаются в
 * провайдере, панель кладётся рядом с документом —
 *
 * ```tsx
 * import { findReplace, FindReplacePanel } from '@inkbrick/react';
 *
 * <EditorProvider editor={editor} keymap={findReplace.keymap}>
 *   <FindReplacePanel />
 *   <DocumentView />
 * </EditorProvider>
 * ```
 *
 * Если у провайдера уже есть свои клавиши: `keymap={[...findReplace.keymap, ...mine]}`.
 */
export const findReplace: { readonly keymap: readonly KeyBinding[] } = {
  keymap: [
    { id: 'find.open', keys: 'Mod-f', run: open(false) },
    { id: 'find.replace', keys: 'Mod-h', run: open(true) },
  ],
};

/** Управление поиском из кода: `open`, `close`, `setQuery`, `go`, `replaceAll`; состояние — `state`. */
export function useFind(): { readonly controller: FindController; readonly state: FindState } {
  const editor = useEditor();
  const view = useEditorView();
  const controller = getFindController(editor, view);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  return { controller, state };
}
