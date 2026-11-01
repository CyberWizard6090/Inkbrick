import { useContext } from 'react';

import { EditorContext } from '../context/EditorContext';

export function useEditor() {
  const editor = useContext(EditorContext);

  if (!editor) {
    throw new Error('useEditor must be used inside <EditorProvider>');
  }

  return editor;
}
