import type { BlockSchema } from './BlockSchema';
import { SchemaRegistry } from './SchemaRegistry';
import { PageSchema } from './blocks/PageSchema';
import { NoteSchema } from './blocks/NoteSchema';
import { ParagraphSchema } from './blocks/ParagraphSchema';
import { HeadingSchema } from './blocks/HeadingSchema';
import { ListSchema } from './blocks/ListSchema';
import { QuoteSchema } from './blocks/QuoteSchema';
import { CodeSchema } from './blocks/CodeSchema';
import { DividerSchema } from './blocks/DividerSchema';
import { CalloutSchema } from './blocks/CalloutSchema';
import { ImageSchema } from './blocks/ImageSchema';
import { FormulaSchema } from './blocks/FormulaSchema';

export const builtinBlockSchemas: readonly BlockSchema[] = [
  PageSchema,
  NoteSchema,
  ParagraphSchema,
  HeadingSchema,
  ListSchema,
  QuoteSchema,
  CodeSchema,
  DividerSchema,
  CalloutSchema,
  ImageSchema,
  FormulaSchema,
];

/**
 * Реестр со всеми встроенными блоками. Дополнительные определения (`extraBlocks`) регистрируются поверх:
 * flavour встроенного блока заменяет его схему (намеренное переопределение), новый — добавляется.
 * Два определения одного нового flavour в `extraBlocks` — ошибка.
 */
export function createSchemaRegistry(extraBlocks: readonly BlockSchema[] = []): SchemaRegistry {
  const registry = new SchemaRegistry(builtinBlockSchemas);
  const builtin = new Set(builtinBlockSchemas.map((schema) => schema.flavour));

  for (const schema of extraBlocks) {
    if (builtin.has(schema.flavour)) {
      builtin.delete(schema.flavour);
      registry.replaceBlock(schema);
    } else {
      registry.registerBlock(schema);
    }
  }

  return registry;
}
