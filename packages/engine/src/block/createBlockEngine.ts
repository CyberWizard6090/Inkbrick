import type { SchemaRegistry } from '@inkbrick/document';
import { BlockEngine } from './BlockEngine';

export function createBlockEngine(schema: SchemaRegistry): BlockEngine {
  return new BlockEngine(schema);
}
