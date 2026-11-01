import { useSyncExternalStore } from 'react';

import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import type { DragState } from './BlockHandleController';
import { getBlockDrag, type BlockDragApi } from './blockDrag';

/**
 * API перетаскивания блоков текущего редактора: на нём строится своя система DnD
 * (dnd-kit, pragmatic-drag-and-drop и т. п.). Объект стабилен между рендерами.
 * Работает внутри `<EditorProvider>`, в том числе в компоненте `slots.BlockHandle`.
 */
export function useBlockDrag(): BlockDragApi {
  return getBlockDrag(useEditor(), useEditorView());
}

export function useBlockDragState(): DragState | null {
  const drag = useBlockDrag();

  return useSyncExternalStore(drag.subscribe, drag.getState, drag.getState);
}
