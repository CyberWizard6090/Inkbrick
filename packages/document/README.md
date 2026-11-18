# @inkbrick/document

The document model of [Inkbrick](https://github.com/CyberWizard6090/Inkbrick): blocks and inline text, block schemas on
[zod](https://zod.dev), validation, serialization with versions and migrations, repair of damaged documents and export
to Markdown, HTML and plain text. No React and no DOM.

```bash
npm install @inkbrick/document
```

## Usage

```ts
import {
  createSchemaRegistry,
  deserializeDocument,
  repairSnapshot,
  toHtml,
  toMarkdown,
  toPlainText,
  validateSnapshot,
  type DocumentSnapshot,
} from '@inkbrick/document';

const schema = createSchemaRegistry();

export function load(json: string) {
  const snapshot = JSON.parse(json) as DocumentSnapshot;
  // Problems are listed instead of thrown; repairSnapshot fixes what it can and says what it changed.
  const safe =
    validateSnapshot(snapshot, schema).length === 0
      ? snapshot
      : repairSnapshot(snapshot, schema).snapshot;
  const document = deserializeDocument(safe, { schema });

  return {
    markdown: toMarkdown(document, { schema }),
    html: toHtml(document),
    text: toPlainText(document),
  };
}
```

- A document is a tree of typed blocks (`BaseBlock`: `id`, `flavour`, `props`, `content`, `children`), inline text is a
  list of `{ insert, attributes }` nodes.
- Snapshots carry the format and schema versions; `deserializeDocument` migrates older snapshots once.
- Export escapes text and passes links and images through `isSafeUrl` / `isSafeImageUrl`.
- `fromMarkdown(text, { schema })` from `@inkbrick/document/markdown` parses Markdown back into a document; it is a separate entry point, so it stays out of the main bundle.

The editor itself is [`@inkbrick/engine`](https://www.npmjs.com/package/@inkbrick/engine), the UI is
[`@inkbrick/react`](https://www.npmjs.com/package/@inkbrick/react).

## License

MIT
