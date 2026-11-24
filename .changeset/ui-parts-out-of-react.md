---
'@inkbrick/engine': minor
'@inkbrick/dom': minor
'@inkbrick/locales': minor
'@inkbrick/react': minor
---

More of the editor works without React:

- `@inkbrick/engine/html` — new entry: `htmlToFragment` and `embeddedFragment` (HTML paste and import → fragment). In
  Node pass a parser: `htmlToFragment(html, { parser })` (jsdom, linkedom); in a browser `DOMParser` is used.
- `@inkbrick/dom/code-highlight` — the built-in code highlighter (`highlightCode`, `normalizeLanguage`,
  `HIGHLIGHT_LIMIT` and the token types).
- `@inkbrick/dom/keys` — `matchesShortcut(event, 'Mod-Shift-z')`.
- `@inkbrick/locales` — the translation runtime: `registerLocale`, `preloadLocale`, `getLocales`, `isLocaleLoaded`,
  `resolveMessages`, `createTranslator`, `interpolate`, `defaultT` and their types.

`@inkbrick/react` re-exports everything it exported before, so existing imports keep working.
