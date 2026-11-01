import type { TFunction } from '../i18n/translate';
import { useEditorUI } from '../ui/EditorUIContext';

export function useT(): TFunction {
  return useEditorUI().t;
}

export function useLocale(): string {
  return useEditorUI().locale;
}
