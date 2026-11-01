import { useSyncExternalStore } from 'react';

import { useEditorUI } from '../ui/EditorUIContext';
import { useEditor } from './useEditor';

export function useReadOnly(): boolean {
  const editor = useEditor();
  const { readOnly } = useEditorUI();

  const state = useSyncExternalStore(
    (listener) => editor.subscribeReadOnly(listener),
    () => editor.readOnly,
    () => editor.readOnly,
  );

  /*
   * Prop провайдера действует сразу (в том числе при серверном рендере, где эффекты не выполняются),
   * а движок синхронизируется эффектом.
   */
  return readOnly ?? state;
}
