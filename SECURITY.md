# Security

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through
[GitHub Security Advisories](https://github.com/CyberWizard6090/Inkbrick/security/advisories/new) or by e-mail to the
maintainer listed in `package.json`. You will get an answer within 7 days; a fix and an advisory follow once the
problem is confirmed.

Supported versions: the latest published minor version of every `@inkbrick/*` package.

## Threat model

Inkbrick treats **everything that comes from outside as untrusted**: documents loaded from a server or a file,
clipboard contents (HTML, plain text, the Inkbrick fragment format) and files dropped or pasted by the user.

| Input                       | Protection                                                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document snapshot           | `deserializeDocument` validates the shape, the tree (one root, no orphans, no cycles), props of known blocks (zod) and schema versions. Broken documents are rejected; `repairSnapshot` can fix them.            |
| Pasted HTML                 | Parsed with `DOMParser` in an isolated document: scripts never run, images never load, nothing is inserted into the page. Only structure, text and a whitelist of formats survive. Input is capped at 2 MB.      |
| Inkbrick clipboard fragment | `sanitizeFragment` re-validates every block, attribute and prop.                                                                                                                                                 |
| Links                       | `isSafeUrl`: only `http(s)`, `mailto`, `tel`, relative paths and anchors. `javascript:`, `data:` and others are dropped. Links open with `rel="noopener noreferrer"`.                                            |
| Images                      | `isSafeImageUrl`: `http(s)`, relative paths and raster `data:` images only (no SVG, no `blob:`). Rendered with `referrerpolicy="no-referrer"`.                                                                   |
| Text colors                 | Palette names or a strict CSS color grammar — no `url()`, `;` or other style injection.                                                                                                                          |
| Formulas                    | Temml runs with `trust: false` (no `\href`, `\url`, `\htmlClass`…), `maxExpand` is limited and formulas are capped at a fixed length. Custom renderers must use their library's safe mode.                       |
| Very large or deep input    | Nesting depth (`MAX_NESTING_DEPTH`), HTML size and depth, formula and data-URL lengths are limited, and every algorithm on the tree is linear (guarded by tests in `packages/engine/__tests__/scaling.test.ts`). |

The editor never uses `innerHTML`/`dangerouslySetInnerHTML` with document content.

## Content Security Policy

Inkbrick works under a strict CSP. A typical policy for an app that embeds the editor:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' https: data:;
connect-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'self';
```

- `style-src 'unsafe-inline'` is needed because formulas inject a `<style>` element (MathML styles) and images use
  inline `width` styles. If you need a nonce-based policy, render formulas without the built-in renderer
  (`formulaRenderer={false}` or your own) and provide the MathML styles from `@inkbrick/react` yourself.
- `img-src data:` is needed only if users may embed images as data URLs (the default without an `images.upload`
  handler). With your own upload handler you can drop `data:`.
- No `unsafe-eval` is required: nothing in Inkbrick evaluates code.

## Dependencies

`pnpm audit` runs daily in CI (the "Dependency audit" workflow, not on every pull request, so a new advisory does not block unrelated changes) and opens an issue when it finds something; it must report no known vulnerabilities. The one exception is advisory
GHSA-g3hv-75wg-m249 (`minimatch` < 11.0.1) for TypeDoc, which needs `minimatch` 10 and only generates the API
reference from our own sources at build time; everything else is forced to a patched version through
`pnpm.overrides`. Runtime dependencies are kept minimal:
`zod` (schemas) and `temml` (formulas, loaded lazily on the first formula).
