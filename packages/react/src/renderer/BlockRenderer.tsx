import { memo, useSyncExternalStore } from 'react';

import type { BlockId } from '@inkbrick/document';

import { BlockChildren } from '../blocks/BlockChildren';
import { UnknownBlockView } from '../blocks/UnknownBlockView';
import { useBlock } from '../hooks/useBlock';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { useReadOnly } from '../hooks/useReadOnly';
import { resolveBlockComponent } from '../registry/resolveBlockComponent';
import { useEditorUI } from '../ui/EditorUIContext';

export interface BlockRendererProps {
  readonly id: BlockId;
}

const warned = new Set<string>();

export const BlockRenderer = memo(function BlockRenderer({ id }: BlockRendererProps) {
  const editor = useEditor();
  const view = useEditorView();
  const readOnly = useReadOnly();
  const { components, slots } = useEditorUI();
  const selected = useSyncExternalStore(
    view.selection.subscribe,
    () => view.selection.isSelected(id),
    () => false,
  );
  const block = useBlock(id);

  if (!block) {
    return null;
  }

  const Component = resolveBlockComponent(block.flavour, components);

  if (Component) {
    return (
      <Component
        block={block}
        editor={editor}
        selected={selected}
        readOnly={readOnly}
        controller={editor.controllers.get(block.flavour)}
      />
    );
  }

  // Неизвестный тип блока не должен ронять редактор и не должен подменяться другим типом.
  if (!warned.has(block.flavour)) {
    warned.add(block.flavour);
    console.warn(`[@inkbrick/react] No component registered for block "${block.flavour}"`);
  }

  const Fallback = slots.UnknownBlock ?? UnknownBlockView;

  return (
    <Fallback block={block} editor={editor} selected={selected} readOnly={readOnly}>
      <BlockChildren id={block.id} />
    </Fallback>
  );
});
