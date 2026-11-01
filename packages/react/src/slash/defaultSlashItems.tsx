import { Icon } from '../icons/Icon';
import type { TFunction } from '../i18n/translate';
import type { MessageKey } from '../i18n/en';
import type { SlashMenuItem } from './types';

export const defaultSlashItems: readonly SlashMenuItem[] = Object.freeze([
  {
    id: 'text',
    title: 'Text',
    description: 'Plain paragraph',
    keywords: ['paragraph', 'p'],
    icon: <Icon name="text" />,
    flavour: 'block:paragraph',
  },
  {
    id: 'heading-1',
    title: 'Heading 1',
    description: 'Large section heading',
    keywords: ['h1', 'title'],
    icon: <Icon name="heading-1" />,
    flavour: 'block:heading',
    props: { level: 1 },
  },
  {
    id: 'heading-2',
    title: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2', 'subtitle'],
    icon: <Icon name="heading-2" />,
    flavour: 'block:heading',
    props: { level: 2 },
  },
  {
    id: 'heading-3',
    title: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3'],
    icon: <Icon name="heading-3" />,
    flavour: 'block:heading',
    props: { level: 3 },
  },
  {
    id: 'heading-4',
    title: 'Heading 4',
    description: 'Subsection heading',
    keywords: ['h4'],
    icon: <Icon name="heading-4" />,
    flavour: 'block:heading',
    props: { level: 4 },
  },
  {
    id: 'heading-5',
    title: 'Heading 5',
    description: 'Minor subsection heading',
    keywords: ['h5'],
    icon: <Icon name="heading-5" />,
    flavour: 'block:heading',
    props: { level: 5 },
  },
  {
    id: 'heading-6',
    title: 'Heading 6',
    description: 'Smallest heading',
    keywords: ['h6'],
    icon: <Icon name="heading-6" />,
    flavour: 'block:heading',
    props: { level: 6 },
  },
  {
    id: 'bullet-list',
    title: 'Bulleted list',
    description: 'Simple bulleted list',
    keywords: ['ul', 'unordered', 'list'],
    icon: <Icon name="list" />,
    flavour: 'block:list',
    props: { type: 'bullet' },
  },
  {
    id: 'numbered-list',
    title: 'Numbered list',
    description: 'List with numbering',
    keywords: ['ol', 'ordered', 'list'],
    icon: <Icon name="list-ordered" />,
    flavour: 'block:list',
    props: { type: 'ordered' },
  },
  {
    id: 'todo-list',
    title: 'To-do list',
    description: 'Track tasks with checkboxes',
    keywords: ['todo', 'task', 'checkbox', 'check'],
    icon: <Icon name="list-todo" />,
    flavour: 'block:list',
    props: { type: 'todo', checked: false },
  },
  {
    id: 'quote',
    title: 'Quote',
    description: 'Capture a quote',
    keywords: ['blockquote', 'citation'],
    icon: <Icon name="quote" />,
    flavour: 'block:quote',
  },
  {
    id: 'code',
    title: 'Code',
    description: 'Code snippet with monospace font',
    keywords: ['snippet', 'pre', 'program'],
    icon: <Icon name="code" />,
    flavour: 'block:code',
  },
  {
    id: 'callout',
    title: 'Callout',
    description: 'Highlight important information',
    keywords: ['info', 'note', 'warning', 'tip', 'alert'],
    icon: <Icon name="info" />,
    flavour: 'block:callout',
  },
  {
    id: 'image',
    title: 'Image',
    description: 'Upload or embed an image',
    keywords: ['picture', 'photo', 'img', 'upload'],
    icon: <Icon name="image" />,
    flavour: 'block:image',
  },
  {
    id: 'formula',
    title: 'Formula',
    description: 'Display a LaTeX formula',
    keywords: ['math', 'equation', 'latex', 'tex'],
    icon: <Icon name="sigma" />,
    flavour: 'block:formula',
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Visually separate sections',
    keywords: ['hr', 'line', 'separator', 'rule'],
    icon: <Icon name="divider" />,
    flavour: 'block:divider',
  },
] satisfies SlashMenuItem[]);

const messageKey = (id: string, part: 'title' | 'description' | 'keywords') =>
  `slash.item.${id}.${part}` as MessageKey;

const splitKeywords = (value: string) =>
  value
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);

export function localizeSlashItems(t: TFunction): readonly SlashMenuItem[] {
  return defaultSlashItems.map((item) => ({
    ...item,
    title: t(messageKey(item.id, 'title')),
    description: t(messageKey(item.id, 'description')),
    // Английские слова остаются в поиске: «h1», «todo» и т. п. работают на любом языке.
    keywords: [
      ...new Set([...(item.keywords ?? []), ...splitKeywords(t(messageKey(item.id, 'keywords')))]),
    ],
  }));
}

/**
 * Итоговый список пунктов: `false` — меню выключено; массив — пункты приложения
 * дополняют стандартные (одинаковый id заменяет стандартный пункт).
 */
export function resolveSlashItems(
  custom: readonly SlashMenuItem[] | false | undefined,
  t?: TFunction,
): readonly SlashMenuItem[] {
  if (custom === false) return [];

  const defaults = t ? localizeSlashItems(t) : defaultSlashItems;

  if (!custom || custom.length === 0) return defaults;

  const overrides = new Map(custom.map((item) => [item.id, item]));
  const merged = defaults.map((item) => overrides.get(item.id) ?? item);
  const extra = custom.filter((item) => !defaultSlashItems.some((d) => d.id === item.id));

  return [...merged, ...extra];
}
