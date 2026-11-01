import { createContext } from 'react';

import type { Editor } from '@inkbrick/engine';

import type { EditorView } from '../editing/EditorView';

export const EditorContext = createContext<Editor | null>(null);

export const EditorViewContext = createContext<EditorView | null>(null);
