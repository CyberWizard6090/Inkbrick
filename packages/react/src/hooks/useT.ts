import type { TFunction } from '@inkbrick/locales';
import { useEditorUI } from '../ui/EditorUIContext';

export function useT(): TFunction {
  return useEditorUI().t;
}

export function useLocale(): string {
  return useEditorUI().locale;
}
