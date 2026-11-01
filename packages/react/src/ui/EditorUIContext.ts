import { createContext, useContext } from 'react';

import { highlightCode } from '../code/highlight';
import { temmlRenderer } from '../math/renderer';
import { defaultT } from '../i18n/translate';
import { defaultKeymap } from '../keymap/defaultKeymap';
import { defaultSlashItems } from '../slash/defaultSlashItems';
import type { EditorUIConfig } from './types';

export const EMPTY_UI_CONFIG: EditorUIConfig = Object.freeze({
  components: Object.freeze({}),
  slots: Object.freeze({}),
  slashItems: defaultSlashItems,
  keymap: defaultKeymap,
  highlighter: highlightCode,
  formulaRenderer: temmlRenderer,
  locale: 'en',
  t: defaultT,
  images: Object.freeze({}),
});

export const EditorUIContext = createContext<EditorUIConfig>(EMPTY_UI_CONFIG);

export function useEditorUI(): EditorUIConfig {
  return useContext(EditorUIContext);
}
