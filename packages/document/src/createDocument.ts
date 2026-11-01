import { Document } from './document';
import type { SchemaRegistry } from './schema';
import { createSchemaRegistry } from './schema';
import { createId } from './utils/id';

export interface CreateDocumentOptions {
  /** Реестр схем; по умолчанию — со всеми встроенными блоками. */
  schema?: SchemaRegistry;
  rootId?: string;
  title?: string;
}

/**
 * Создаёт документ с минимальной структурой: page → note → paragraph.
 * Пропсы блоков берутся из схем, поэтому всегда проходят валидацию.
 */
export function createDocument(options: CreateDocumentOptions = {}): Document {
  const schema = options.schema ?? createSchemaRegistry();
  const rootId = options.rootId ?? 'page-001';

  const document = new Document(rootId);

  const noteId = `note-${createId()}`;
  const paragraphId = `paragraph-${createId()}`;

  document._setBlock({
    id: rootId,
    flavour: 'block:page',
    parentId: null,
    children: [noteId],
    content: [],
    props: schema.createProps('block:page', { title: options.title ?? 'Новый документ' }),
  });

  document._setBlock({
    id: noteId,
    flavour: 'block:note',
    parentId: rootId,
    children: [paragraphId],
    content: [],
    props: schema.createProps('block:note'),
  });

  document._setBlock({
    id: paragraphId,
    flavour: 'block:paragraph',
    parentId: noteId,
    children: [],
    content: [],
    props: schema.createProps('block:paragraph'),
  });

  return document;
}
