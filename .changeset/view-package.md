---
'@inkbrick/view': minor
'@inkbrick/react': minor
---

New package `@inkbrick/view`: the core of the editor UI without a framework. `EditorView`, reading and placing the
selection, `beforeinput` handling, inline rendering and the UI state controllers (slash menu, toolbar, context menu,
find, palette, folds, picked blocks, cell selection, block handle, viewport) moved there from `@inkbrick/react`, which
now draws React components over it. A binding for another framework can reuse the same core.

`EditorView` takes `{ commit }`: a function that runs an edit and renders it before the caret is placed (React passes
`flushSync`). `@inkbrick/react` exports what it exported before.
