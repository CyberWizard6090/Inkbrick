import { useSyncExternalStore } from 'react';

import { useEditor } from './useEditor';

export function useDocument() {
  const editor = useEditor();
  const { store } = editor;

  useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getVersion(),
    () => store.getVersion(),
  );

  return editor.document;
}
