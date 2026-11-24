import { createContext, useContext } from 'react';
import { temmlRenderer } from '@inkbrick/view';

import { lazyHighlightCode } from '../code/lazyHighlight';
import { defaultT } from '@inkbrick/locales';
import { defaultKeymap } from '../keymap/defaultKeymap';
import { defaultSlashItems } from '../slash/defaultSlashItems';
import type { EditorUIConfig } from './types';

export const EMPTY_UI_CONFIG: EditorUIConfig = Object.freeze({
  components: Object.freeze({}),
  slots: Object.freeze({}),
  slashItems: defaultSlashItems,
  keymap: defaultKeymap,
  highlighter: lazyHighlightCode,
  formulaRenderer: temmlRenderer,
  locale: 'en',
  spellcheck: false,
  t: defaultT,
  images: Object.freeze({}),
  formatting: 'context-menu',
  contextMenu: Object.freeze([]),
});

export const EditorUIContext = createContext<EditorUIConfig>(EMPTY_UI_CONFIG);

export function useEditorUI(): EditorUIConfig {
  return useContext(EditorUIContext);
}
