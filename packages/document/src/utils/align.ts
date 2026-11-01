import type { BlockProps } from '../model/BlockProps';

export const ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;

export type Alignment = (typeof ALIGNMENTS)[number];

/**
 * Блоки, у которых есть выравнивание текста, и имя их prop. Исторически у абзаца prop называется `alignment`,
 * у остальных — `align` (как у изображения); этот список скрывает различие.
 */
const ALIGN_KEYS: Readonly<Record<string, 'alignment' | 'align'>> = {
  'block:paragraph': 'alignment',
  'block:heading': 'align',
  'block:quote': 'align',
  'block:list': 'align',
  'block:callout': 'align',
};

export const isAlignment = (value: unknown): value is Alignment =>
  typeof value === 'string' && (ALIGNMENTS as readonly string[]).includes(value);

export const isAlignable = (flavour: string): boolean => flavour in ALIGN_KEYS;

export function getBlockAlign(block: {
  flavour: string;
  props: Readonly<Record<string, unknown>>;
}): Alignment | undefined {
  const key = ALIGN_KEYS[block.flavour];

  if (!key) return undefined;

  const value = block.props[key];

  return isAlignment(value) ? value : 'left';
}

export function alignProps(flavour: string, align: Alignment): BlockProps | undefined {
  const key = ALIGN_KEYS[flavour];

  return key ? { [key]: align } : undefined;
}
