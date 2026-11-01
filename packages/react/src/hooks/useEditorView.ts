import { useContext } from 'react';

import { EditorViewContext } from '../context/EditorContext';

export function useEditorView() {
  const view = useContext(EditorViewContext);

  if (!view) {
    throw new Error('useEditorView must be used inside <EditorProvider>');
  }

  return view;
}
