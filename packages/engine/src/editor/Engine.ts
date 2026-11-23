import type { SchemaRegistry } from '@inkbrick/document';
import type { DocumentStore } from '@inkbrick/store';

import { BlockEngine } from '../block';
import { InlineEngine } from '../inline';
import { DocumentNormalizer, fillEmptyContainers } from '../normalizer';

export interface EngineOptions {
  store: DocumentStore;
  schema: SchemaRegistry;
}

export class Engine {
  readonly store: DocumentStore;
  readonly schema: SchemaRegistry;
  readonly block: BlockEngine;
  readonly inline: InlineEngine;
  /** Правила нормализации документа: выполняются после каждой команды (см. `DocumentNormalizer`). */
  readonly normalizer = new DocumentNormalizer();

  readOnly = false;

  /** Закреплённый блок (см. `Editor.pin`): команда, после которой его нет или он сменил родителя, откатывается. */
  pinned: { id: string; parentId: string | null; flavour: string } | null = null;

  constructor(options: EngineOptions) {
    this.store = options.store;
    this.schema = options.schema;
    this.block = new BlockEngine(options.schema);
    this.inline = new InlineEngine();
    this.normalizer.add(fillEmptyContainers);
  }
}
