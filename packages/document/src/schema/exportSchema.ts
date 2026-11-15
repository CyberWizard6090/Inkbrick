import type { SchemaRegistry } from './SchemaRegistry';

/** Версия формата файла `schema/blocks.json`. */
export const SCHEMA_EXPORT_VERSION = 1;

export interface ExportedBlock {
  role: 'root' | 'hub' | 'content';
  /** Хранит ли блок редактируемый текст. */
  inline: boolean;
  /** Flavour, которые можно класть в этот блок (с учётом `allowedChildren` и `allowedParents` обеих сторон). */
  children: string[];
}

export interface ExportedSchema {
  version: number;
  blocks: Record<string, ExportedBlock>;
}

/**
 * Схема вложенности в виде данных для кода на других языках (сервер проверяет документы по ней).
 * Предикаты и роли раскрываются перебором всех пар flavour, поэтому в файле только списки.
 * Файл `schema/blocks.json` строится этой функцией; тест следит, чтобы он не отставал от кода.
 */
export function exportSchema(registry: SchemaRegistry): ExportedSchema {
  const schemas = registry.getAllBlockSchemas().sort((a, b) => (a.flavour < b.flavour ? -1 : 1));
  const blocks: Record<string, ExportedBlock> = {};

  for (const schema of schemas) {
    blocks[schema.flavour] = {
      role: registry.getRole(schema.flavour),
      inline: schema.inline ?? true,
      children: schemas
        .filter((child) => registry.validateRelation(schema.flavour, child.flavour))
        .map((child) => child.flavour),
    };
  }

  return { version: SCHEMA_EXPORT_VERSION, blocks };
}
